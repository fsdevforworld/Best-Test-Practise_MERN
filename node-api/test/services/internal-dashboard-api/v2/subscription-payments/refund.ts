import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  createInternalUser,
  stubLoomisClient,
  TABAPAY_ACCOUNT_ID,
  withInternalUser,
} from '../../../../test-helpers';
import factory from '../../../../factories';

import {
  DashboardActionReason,
  DashboardAction,
  PaymentMethod,
  SubscriptionPayment,
  DashboardActionLog,
  Reimbursement,
} from '../../../../../src/models';
import * as sinon from 'sinon';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Tabapay from '../../../../../src/lib/tabapay';
import { expect } from 'chai';
import { PaymentError } from '@dave-inc/error-types';
import { IApiResourceObject } from '../../../../../src/typings';
import { validateRelationships } from '../../../../test-helpers';

const sandbox = sinon.createSandbox();

describe('POST /v2/subscription-payments/:id/refund', () => {
  before(() => clean());
  beforeEach(() => stubLoomisClient(sandbox));
  afterEach(() => clean(sandbox));

  const refundCode = 'refund-subscription';

  describe('happy path', () => {
    let debitCard: PaymentMethod;
    let subscriptionPayment: SubscriptionPayment;
    let dashboardAction: DashboardAction;
    let dashboardActionReason: DashboardActionReason;
    let req: request.Test;

    beforeEach(async () => {
      debitCard = await factory.create<PaymentMethod>('payment-method', {
        tabapayId: TABAPAY_ACCOUNT_ID,
      });

      const subscriptionBilling = await factory.create('subscription-billing');

      subscriptionPayment = await factory.create<SubscriptionPayment>('subscription-payment', {
        userId: debitCard.userId,
        paymentMethodId: debitCard.id,
        amount: 1.0,
        status: ExternalTransactionStatus.Completed,
      });

      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: subscriptionBilling.id,
        subscriptionPaymentId: subscriptionPayment.id,
      });

      dashboardAction = await factory.create('dashboard-action', {
        code: refundCode,
      });
      dashboardActionReason = await factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      });

      req = request(app).post(`/v2/subscription-payments/${subscriptionPayment.id}/refund`);
    });

    it('should reimburse subscription payment', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      });

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'this is a note',
        })
        .expect(200);

      await withInternalUser(req);

      const reimbursement = await Reimbursement.findOne({ where: { userId: debitCard.userId } });

      expect(reimbursement).to.not.be.null;
      expect(reimbursement.amount).to.equal(1.0);
      expect(reimbursement.subscriptionPaymentId).to.equal(subscriptionPayment.id);
      expect(reimbursement.extra.transactionResult.status).to.equal('COMPLETED');
      expect(reimbursement.extra.transactionResult.processor).to.equal('TABAPAY');
    });

    it('should create a dashboard action log', async () => {
      const agent = await createInternalUser();

      sandbox.stub(Tabapay, 'disburse').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      });

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'this is a note',
        })
        .expect(200);

      await withInternalUser(req, agent);

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      expect(actionLog).to.not.be.null;
      expect(actionLog.note).to.eq('this is a note');
      expect(actionLog.zendeskTicketUrl).to.eq('123');
    });

    it('should return action log info', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      });

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'this is a note',
        })
        .expect(200);

      const {
        body: { data, included },
      } = await withInternalUser(req);

      const [actionLogIncluded] = included.filter(
        (r: IApiResourceObject) => r.type === 'action-log',
      );

      validateRelationships(
        { data, included },
        { actionLog: 'action-log', subscriptionBillings: 'subscription-billing' },
      );

      expect(actionLogIncluded.attributes).to.deep.include({
        dashboardActionName: dashboardAction.name,
        dashboardActionReasonName: dashboardActionReason.reason,
      });
    });

    it('should return billing with updated status', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 1,
        processor: ExternalTransactionProcessor.Tabapay,
      });

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'this is a note',
        })
        .expect(200);

      const {
        body: { included },
      } = await withInternalUser(req);

      const [billingIncluded] = included.filter(
        (r: IApiResourceObject) => r.type === 'subscription-billing',
      );

      expect(billingIncluded?.attributes).to.deep.include({
        status: 'REFUNDED',
      });
    });

    it('should create failed reimbursement and action log if disbursement fails', async () => {
      const agent = await createInternalUser();

      sandbox.stub(Tabapay, 'disburse').rejects(new PaymentError('Payment failed'));

      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: '123',
          note: 'this is a note',
        })
        .expect(200);

      await withInternalUser(req, agent);

      const reimbursement = await Reimbursement.findOne({ where: { userId: debitCard.userId } });
      expect(reimbursement).to.not.be.null;
      expect(reimbursement.status).to.eq('FAILED');

      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
      });

      expect(actionLog).to.not.be.null;
    });
  });
});
