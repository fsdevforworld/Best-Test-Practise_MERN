import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import twilio from '../../../../../src/lib/twilio';
import * as sinon from 'sinon';
import {
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

const sandbox = sinon.createSandbox();

describe('PATCH /v2/advances/:id/disbursement-status', () => {
  before(() => clean());

  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
  });

  afterEach(() => clean(sandbox));

  let canceledActionReason: DashboardActionReason;
  let completedActionReason: DashboardActionReason;
  let dashboardAction;

  beforeEach(async () => {
    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.AdvanceDisbursementStatusChange,
    });

    [canceledActionReason, completedActionReason] = await Promise.all([
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'Canceled',
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        reason: 'Completed',
      }),
    ]);
  });

  it('returns serialized advance with status updated to CANCELED', async () => {
    const advance = await factory.create('advance');

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.type).to.equal('advance');
    expect(data.id).to.equal(`${advance.id}`);
    expect(data.attributes.disbursementStatus).to.equal('CANCELED');
  });

  it('returns serialized advance with status updated to COMPLETED', async () => {
    const advance = await factory.create('advance', { disbursementStatus: 'PENDING' });

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.type).to.equal('advance');
    expect(data.id).to.equal(`${advance.id}`);
    expect(data.attributes.disbursementStatus).to.equal('COMPLETED');
  });

  it('creates dashboard action log and dashboard advance modification', async () => {
    const agent = await createInternalUser();

    const advance = await factory.create('advance', { disbursementStatus: 'PENDING' });

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req, agent);

    const dashboardActionLog = await DashboardActionLog.findOne({
      where: { internalUserId: agent.id },
    });

    expect(dashboardActionLog).to.exist;
    expect(dashboardActionLog.dashboardActionReasonId).to.equal(completedActionReason.id);
    expect(dashboardActionLog.zendeskTicketUrl).to.equal('123');
    expect(dashboardActionLog.note).to.equal('resolved');

    const dashboardAdvanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: dashboardActionLog.id },
    });

    const expectedModification = {
      disbursementStatus: { previousValue: 'PENDING', currentValue: 'COMPLETED' },
    };

    expect(dashboardAdvanceModification).to.exist;
    expect(dashboardAdvanceModification.advanceId).to.equal(advance.id);
    expect(dashboardAdvanceModification.modification).to.deep.eq(expectedModification);
  });

  it('creates dashboard advance modification with outstanding amount when status CANCELED', async () => {
    const agent = await createInternalUser();

    const advance = await factory.create('advance', { disbursementStatus: 'PENDING' });

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    await withInternalUser(req, agent);

    const dashboardActionLog = await DashboardActionLog.findOne({
      where: { internalUserId: agent.id },
    });

    expect(dashboardActionLog).to.exist;
    expect(dashboardActionLog.dashboardActionReasonId).to.equal(canceledActionReason.id);
    expect(dashboardActionLog.zendeskTicketUrl).to.equal('123');
    expect(dashboardActionLog.note).to.equal('resolved');

    const dashboardAdvanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: dashboardActionLog.id },
    });

    const expectedModification = {
      disbursementStatus: {
        previousValue: 'PENDING',
        currentValue: 'CANCELED',
      },
      outstanding: {
        previousValue: 75,
        currentValue: 0,
      },
    };

    expect(dashboardAdvanceModification).to.exist;
    expect(dashboardAdvanceModification.advanceId).to.equal(advance.id);
    expect(dashboardAdvanceModification.modification).to.deep.eq(expectedModification);
  });

  it('returns no content if status is COMPLETED already', async () => {
    const advance = await factory.create('advance', { disbursementStatus: 'COMPLETED' });

    await factory.create('advance-tip', { advanceId: advance.id });

    request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'COMPLETED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(204);
  });

  it('returns no content if status is CANCELED already', async () => {
    const advance = await factory.create('advance', { disbursementStatus: 'CANCELED' });

    await factory.create('advance-tip', { advanceId: advance.id });

    request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(204);
  });

  it('works if advance has outstanding == 0', async () => {
    const advance = await factory.create('advance', { outstanding: 0 });

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'CANCELED',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.type).to.equal('advance');
    expect(data.id).to.equal(`${advance.id}`);
    expect(data.attributes.disbursementStatus).to.equal('CANCELED');
  });

  it('fails if status is not valid', async () => {
    const advance = await factory.create('advance');

    await factory.create('advance-tip', { advanceId: advance.id });

    const req = request(app)
      .patch(`/v2/advances/${advance.id}/disbursement-status`)
      .send({
        status: 'PENDING',
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(400);

    const response = await withInternalUser(req);

    const { Canceled, Completed } = ExternalTransactionStatus;

    expect(response.body.message).to.contain(`Status must be either ${Canceled} or ${Completed}`);
  });
});
