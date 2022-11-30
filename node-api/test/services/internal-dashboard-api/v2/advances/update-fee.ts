import { expect } from 'chai';
import * as request from 'supertest';
import {
  Advance,
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import { IDashboardModification } from '../../../../typings';

describe('PATCH /v2/advances/:id/fee', () => {
  before(() => clean());

  afterEach(() => clean());

  const updateFeeCode = 'fee-change';

  let advance: Advance;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;

  beforeEach(async () => {
    advance = await factory.create<Advance>('advance', {
      amount: 40,
      fee: 6,
      outstanding: 46,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 0,
    });

    dashboardAction = await factory.create('dashboard-action', {
      code: updateFeeCode,
    });
    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });
  });

  it('should update fee and outstanding', async () => {
    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 0,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    const {
      body: {
        data: {
          attributes: { fee, outstanding },
        },
      },
    } = await withInternalUser(req);

    expect(fee).to.eq(0);
    expect(outstanding).to.eq(40);
  });

  it('should create dashboard action log and advance modification', async () => {
    const agent = await createInternalUser();

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 0,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(200);

    await withInternalUser(req, agent);

    const actionLog = await DashboardActionLog.findOne({
      where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
    });

    const advanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: actionLog.id },
    });

    expect(actionLog).to.not.be.null;
    expect(actionLog.note).to.eq('late');
    expect(actionLog.zendeskTicketUrl).to.eq('123');

    const expectedModification: IDashboardModification = {
      fee: {
        previousValue: 6,
        currentValue: 0,
      },
      outstanding: {
        previousValue: 46,
        currentValue: 40,
      },
    };

    expect(advanceModification).to.not.be.null;
    expect(advanceModification.modification).to.eql(expectedModification);
  });

  it('should succeed when optional body parameters are missing', async () => {
    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 0,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(200);

    await withInternalUser(req);
  });

  it('should update with increased fee', async () => {
    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 8,
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(200);

    const {
      body: {
        data: {
          attributes: { fee, outstanding },
        },
      },
    } = await withInternalUser(req);

    expect(fee).to.eq(8);
    expect(outstanding).to.eq(48);
  });

  it('should throw BadRequestError when dashboard action reason is not for fee change dashboard action', async () => {
    const action = await factory.create('dashboard-action', {
      code: 'gobble-gobble',
    });
    const actionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: action.id,
    });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 0,
        dashboardActionReasonId: actionReason.id,
        zendeskTicketUrl: '123',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      `Dashboard action reason provided does not correspond to the "${updateFeeCode}" dashboard action`,
    );
  });

  it('should throw BadRequestError when required params are missing', async () => {
    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({})
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include(
      'Required parameters not provided: fee, dashboardActionReasonId, zendeskTicketUrl',
    );
  });

  it('should throw NotFoundError when dashboardActionReasonId not found', async () => {
    const req = request(app)
      .patch(`/v2/advances/${advance.id}/fee`)
      .send({
        fee: 0,
        dashboardActionReasonId: 1,
        zendeskTicketUrl: '123',
        note: 'late',
      })
      .expect(404);

    const res = await withInternalUser(req);

    expect(res.body.message).to.include('DashboardActionReason with id 1 not found');
  });
});
