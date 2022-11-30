import * as request from 'supertest';
import { expect } from 'chai';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import { IApiResourceObject } from '../../../../typings';
import {
  InternalUser,
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardSubscriptionBillingModification,
} from '../../../../../src/models';
import { validateRelationships } from '../../../../test-helpers';

describe('GET /v2/subscription-billings/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  it('includes related subscription payments', async () => {
    const billing = await factory.create('subscription-billing');
    const debitCard = await factory.create('payment-method', {
      userId: billing.userId,
    });

    const paymentTestParams = {
      amount: 1,
      externalProcessor: 'TABAPAY',
      externalId: 'foo-123',
      referenceId: 'ref-123',
      status: 'COMPLETED',
    };

    const payment = await factory.create('subscription-payment', {
      ...paymentTestParams,
      paymentMethodId: debitCard.id,
      userId: debitCard.userId,
      bankAccountId: null,
    });

    await billing.addSubscriptionPayment(payment);

    const {
      body: { included },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    const [subscriptionPaymentResponse] = included.filter(
      (r: IApiResourceObject) => r.type === 'subscription-payment',
    );
    expect(subscriptionPaymentResponse.id).to.equal(`${payment.id}`);
    expect(subscriptionPaymentResponse.attributes).to.include({
      subscriptionBillingId: billing.id,
      ...paymentTestParams,
      paymentMethodUniversalId: `DEBIT:${debitCard.id}`,
    });
  });

  it('includes payment relationships', async () => {
    const billing = await factory.create('subscription-billing');
    const debitCard = await factory.create('payment-method', {
      userId: billing.userId,
    });

    const payment = await factory.create('subscription-payment', {
      paymentMethodId: debitCard.id,
      userId: debitCard.userId,
      bankAccountId: null,
    });

    await billing.addSubscriptionPayment(payment);

    const {
      body: { data, included },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    validateRelationships({ data, included }, { subscriptionPayments: 'subscription-payment' });
  });

  it('includes canWaive', async () => {
    const billing = await factory.create('subscription-billing');

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    expect(data.attributes).to.deep.include({
      canWaive: true,
    });
  });

  it('includes related action logs', async () => {
    const [billing, payment, internalUser, debitCard] = await Promise.all([
      factory.create('subscription-billing'),
      factory.create('subscription-payment'),
      factory.create('internal-user', { email: 'tester@dave.com' }),
      factory.create('payment-method'),
    ]);

    const action = await factory.create('dashboard-action');
    const reason = await factory.create('dashboard-action-reason', {
      dashboardActionId: action.id,
    });
    const actionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: reason.id,
    });

    await billing.addSubscriptionPayment(payment);

    const refundParams = {
      amount: 1,
      externalId: 'my-id',
      externalProcessor: 'TABAPAY',
      referenceId: 'my-ref-id',
      subscriptionPaymentId: payment.id,
      status: 'COMPLETED',
      reason: 'Foo bar',
    };
    const transactionResult = {
      data: {
        EC: '0',
        SC: 200,
        status: 'ERROR',
        gateway: 'TABAPAY',
        network: 'VisaFF',
        networkID: 'foo',
        networkRC: 'ZZ',
        transactionID: 'foo-bar',
        isSubscription: false,
        processorHttpStatus: 200,
      },
      status: 'FAILED',
      processor: 'TABAPAY',
    };
    await factory.create('reimbursement', {
      ...refundParams,
      payableId: debitCard.id,
      payableType: 'PAYMENT_METHOD',
      zendeskTicketId: 'test.com',
      reimburserId: internalUser.id,
      extra: {
        note: 'baz bop',
        transactionResult,
      },
      dashboardActionLogId: actionLog.id,
    });

    const {
      body: { included },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    const [actionLogIncluded] = included.filter((r: IApiResourceObject) => r.type === 'action-log');

    expect(actionLogIncluded.attributes).to.deep.include({
      dashboardActionName: action.name,
      dashboardActionReasonName: reason.reason,
    });
  });

  it('responds with details about the subscription', async () => {
    const billingTestParams = {
      amount: 1,
      billingCycle: '2020-09',
      dueDate: '2020-01-05',
    };

    const billing = await factory.create('subscription-billing', billingTestParams);

    const {
      body: { data: billingResponse },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    expect(billingResponse.type).to.equal('subscription-billing');
    expect(billingResponse.id).to.equal(`${billing.id}`);
    expect(billingResponse.attributes).to.include({
      userId: billing.userId,
      ...billingTestParams,
      status: 'UNCOLLECTABLE',
    });
  });

  it('includes modifications', async () => {
    const billing = await factory.create('subscription-billing');
    const modification = await factory.create<DashboardSubscriptionBillingModification>(
      'dashboard-subscription-billing-modification',
      {
        subscriptionBillingId: billing.id,
      },
    );

    const {
      body: { included },
    } = await withInternalUser(request(app).get(`/v2/subscription-billings/${billing.id}`));

    await modification.reload({
      include: [
        {
          model: DashboardActionLog,
          include: [
            {
              model: DashboardActionReason,
              include: [DashboardAction],
            },
            InternalUser,
          ],
        },
      ],
    });

    const [modificationResponse] = included.filter(
      (r: IApiResourceObject) => r.type === `${modification.getModifiedEntityType()}-modification`,
    );
    const actionLog = modification.dashboardActionLog;
    const actionReason = actionLog.dashboardActionReason;
    const action = actionReason.dashboardAction;

    expect(modificationResponse.id).to.equal(`${modification.id}`);
    expect(modificationResponse.attributes).to.include({
      modifiedEntityType: modification.getModifiedEntityType(),
      modifiedEntityId: billing.id,
      dashboardActionId: action.id,
      dashboardActionName: action.name,
      dashboardActionCode: action.code,
      dashboardActionReasonName: actionReason.reason,
      dashboardActionReasonId: actionReason.id,
      note: actionLog.note,
      zendeskTicketUrl: actionLog.zendeskTicketUrl,
      internalUserId: actionLog.internalUserId,
      internalUserEmail: actionLog.internalUser.email,
    });
  });
});
