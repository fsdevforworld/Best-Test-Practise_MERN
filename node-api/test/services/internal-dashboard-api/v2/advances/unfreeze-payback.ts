import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import {
  Advance,
  DashboardActionLog,
  DashboardActionReason,
  DashboardAdvanceModification,
} from '../../../../../src/models';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('POST /v2/advances/:id/unfreeze-payback', () => {
  before(() => clean());

  afterEach(() => clean());

  let advance: Advance;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let req: request.Test;

  beforeEach(async () => {
    advance = await factory.create('advance', { paybackFrozen: true });

    await factory.create('advance-tip', { advanceId: advance.id });

    dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.UnfreezeAdvancePayback,
    });
    dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    req = request(app)
      .post(`/v2/advances/${advance.id}/unfreeze-payback`)
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(200);
  });

  it('Returns an advance with paybackFrozen false', async () => {
    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.attributes.paybackFrozen).to.be.false;
  });

  it('Creates action log and advance modification', async () => {
    const agent = await createInternalUser();

    await withInternalUser(req, agent);

    const dashboardActionLog = await DashboardActionLog.findOne({
      where: { internalUserId: agent.id },
    });

    expect(dashboardActionLog).to.exist;
    expect(dashboardActionLog.dashboardActionReasonId).to.equal(dashboardActionReason.id);
    expect(dashboardActionLog.zendeskTicketUrl).to.equal('123');
    expect(dashboardActionLog.note).to.equal('resolved');

    const dashboardAdvanceModification = await DashboardAdvanceModification.findOne({
      where: { dashboardActionLogId: dashboardActionLog.id },
    });

    const expectedModification = { paybackFrozen: { previousValue: true, currentValue: false } };

    expect(dashboardAdvanceModification).to.exist;
    expect(dashboardAdvanceModification.advanceId).to.equal(advance.id);
    expect(dashboardAdvanceModification.modification).to.deep.eq(expectedModification);
  });

  it('Does not create log or modification if paybackFrozen is already false', async () => {
    const unfrozenAdvance = await factory.create('advance', { paybackFrozen: false });

    const unfrozenRequest = request(app)
      .post(`/v2/advances/${unfrozenAdvance.id}/unfreeze-payback`)
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'resolved',
      })
      .expect(204);

    await withInternalUser(unfrozenRequest);

    const dashboardActionLogs = await DashboardActionLog.findAll({
      where: { dashboardActionReasonId: dashboardActionReason.id },
    });

    expect(dashboardActionLogs).to.have.length(0);

    const modifications = await DashboardAdvanceModification.findAll({
      where: { advanceId: advance.id },
    });

    expect(modifications).to.have.length(0);
  });
});
