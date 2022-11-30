import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as Jobs from '../../../../../src/jobs/data';
import {
  Advance,
  AdvanceTip,
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import { IDashboardModification } from '../../../../typings';

describe('PATCH /v2/advances/:id/tip', () => {
  const sandbox = sinon.createSandbox();
  let broadcastAdvanceTipChangedJobStub: sinon.SinonStub;
  const updateTipCode = 'tip-change';

  before(() => clean());

  beforeEach(() => {
    broadcastAdvanceTipChangedJobStub = sandbox.stub(Jobs, 'broadcastAdvanceTipChangedTask');
  });

  afterEach(() => clean(sandbox));

  describe('happy path', async () => {
    let advance: Advance;
    let advanceTip: AdvanceTip;
    let dashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      advance = await factory.create<Advance>('advance', {
        amount: 40,
        outstanding: 50,
      });
      advanceTip = await factory.create('advance-tip', {
        advanceId: advance.id,
        amount: 10,
        percent: 25,
      });

      dashboardAction = await factory.create('dashboard-action', {
        code: updateTipCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).patch(`/v2/advances/${advance.id}/tip`);
    });

    it('should update tip and outstanding', async () => {
      const {
        body: {
          data: {
            attributes: { tip, tipPercent, outstanding },
          },
        },
      } = await withInternalUser(
        req
          .send({
            amount: 4,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: '123',
            note: 'too much',
          })
          .expect(200),
      );

      expect(tip).to.equal(4);
      expect(tipPercent).to.equal(10);
      expect(outstanding).to.equal(44);
      expect(broadcastAdvanceTipChangedJobStub).to.be.calledOnce;
    });

    it('should create dashboard action log and advance modification', async () => {
      const agent = await createInternalUser();

      await withInternalUser(
        req
          .send({
            amount: 4,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: '123',
            note: 'too much',
          })
          .expect(200),
        agent,
      );

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      const advanceModification = await DashboardAdvanceModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(actionLog).to.not.be.null;
      expect(actionLog.note).to.eq('too much');
      expect(actionLog.zendeskTicketUrl).to.eq('123');

      const expectedModification: IDashboardModification = {
        tipAmount: {
          previousValue: advanceTip.amount,
          currentValue: 4,
        },
        tipPercent: {
          previousValue: advanceTip.percent,
          currentValue: 10,
        },
        outstanding: {
          previousValue: 50,
          currentValue: 44,
        },
      };

      expect(advanceModification).to.not.be.null;
      expect(advanceModification.modification).to.eql(expectedModification);
    });

    it('should succeed when optional note is missing', async () => {
      await withInternalUser(
        req
          .send({
            amount: 0,
            dashboardActionReasonId: dashboardActionReason.id,
            zendeskTicketUrl: '123',
          })
          .expect(200),
      );
    });
  });

  it('should throw BadRequestError if dashboard action reason is not for payback date change dashboard action', async () => {
    const advance = await factory.create<Advance>('advance');
    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
    });
    const dashboardAction = await factory.create('dashboard-action', {
      code: 'gobble-gobble',
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/tip`)
      .send({
        amount: 0,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'too much',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${updateTipCode}" dashboard action`,
    );
  });

  it('should throw InvalidParametersError if outstanding would be negative, and should not create logs', async () => {
    const advance = await factory.create<Advance>('advance', { amount: 100, outstanding: 5 });
    await factory.create<AdvanceTip>('advance-tip', {
      advanceId: advance.id,
      amount: 25,
      percent: 25,
    });
    const dashboardAction = await factory.create('dashboard-action', {
      code: updateTipCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const agent = await createInternalUser();

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/tip`)
      .send({
        amount: 5,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'too much',
      })
      .expect(400);

    const res = await withInternalUser(req, agent);

    expect(res.body.message).to.include('New tip amount leads to a negative amount owed.');

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
    });

    expect(actionLog).to.be.null;
  });

  it('should throw BadRequestError when required params are missing', async () => {
    const advance = await factory.create<Advance>('advance');

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/tip`)
      .send({})
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      'Required parameters not provided: amount, dashboardActionReasonId, zendeskTicketUrl',
    );
  });

  it('should throw NotFoundError when dashboardActionReasonId not found', async () => {
    const advance = await factory.create<Advance>('advance');

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/tip`)
      .send({
        amount: 0,
        dashboardActionReasonId: 1,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(404);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include('DashboardActionReason with id 1 not found');
  });
});
