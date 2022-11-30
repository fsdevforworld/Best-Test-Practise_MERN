import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import SubscriptionBilling from '../../../../../src/models/subscription-billing';
import { expect } from 'chai';
import { clean, createInternalUser, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';

import {
  DashboardActionReason,
  DashboardAction,
  DashboardActionLog,
  DashboardSubscriptionBillingModification,
  SubscriptionPayment,
} from '../../../../../src/models';
import { IDashboardModification } from '../../../../../src/typings';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('POST /v2/subscription-billings/:id/waive', () => {
  before(() => clean());
  afterEach(() => clean());

  const waiveCode = 'waive-subscription';

  describe('happy path', () => {
    let seedBilling: SubscriptionBilling;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      seedBilling = await factory.create<SubscriptionBilling>('subscription-billing');

      dashboardAction = await factory.create('dashboard-action', {
        code: waiveCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).post(`/v2/subscription-billings/${seedBilling.id}/waive`);
    });

    it('should waive subscription billing', async () => {
      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'note',
        })
        .expect(200);

      const res = await withInternalUser(req);

      const billing = await SubscriptionBilling.findByPk(seedBilling.id);

      expect(res.body.data.id).to.equal(billing.id.toString());
      expect(billing.amount).to.equal(0);
    });

    it('should create dashboard action log and subscription modification', async () => {
      const agent = await createInternalUser();

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'gotta be fresh',
        })
        .expect(200);

      const res = await withInternalUser(req, agent);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      const subscriptionModification = await DashboardSubscriptionBillingModification.findOne({
        where: { dashboardActionLogId: actionLog.id },
      });

      expect(actionLog).to.not.be.null;
      expect(actionLog.note).to.eq('gotta be fresh');
      expect(actionLog.zendeskTicketUrl).to.eq('123');
      expect(res.body.included.length).to.equal(1);
      expect(res.body.included[0].type).to.equal('subscription-billing-modification');
      expect(res.body.included[0].id).to.equal(subscriptionModification.id.toString());

      const expectedModification: IDashboardModification = {
        amount: {
          previousValue: 1,
          currentValue: 0,
        },
      };

      expect(subscriptionModification).to.not.be.null;
      expect(subscriptionModification.modification).to.eql(expectedModification);
    });
  });

  it('should fail if the subscription has been paid', async () => {
    const seedBilling = await factory.create<SubscriptionBilling>('subscription-billing');
    const payment = await factory.create<SubscriptionPayment>('subscription-payment');
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: seedBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const dashboardAction = await factory.create('dashboard-action', {
      code: waiveCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post(`/v2/subscription-billings/${seedBilling.id}/waive`)
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'gotta be fresh',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.contain(
      'Subscription billing cannot be waived: it has already been paid, waived, or refunded.',
    );
  });

  it('should fail if the subscription payment is still pending', async () => {
    const seedBilling = await factory.create<SubscriptionBilling>('subscription-billing');
    const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
      status: ExternalTransactionStatus.Pending,
    });
    await factory.create('subscription-payment-line-item', {
      subscriptionBillingId: seedBilling.id,
      subscriptionPaymentId: payment.id,
    });

    const dashboardAction = await factory.create('dashboard-action', {
      code: waiveCode,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post(`/v2/subscription-billings/${seedBilling.id}/waive`)
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        zendeskTicketUrl: '123',
        note: 'gotta be fresh',
      })
      .expect(400);

    const res = await withInternalUser(req);

    expect(res.body.message).to.contain(
      'Subscription billing cannot be waived: it has already been paid, waived, or refunded.',
    );
  });
});
