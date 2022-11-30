import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  getSubscriptionBillingStatus,
  FormattedBillingStatus,
} from '../../../../../src/services/internal-dashboard-api/domain/subscription-billing';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { Reimbursement } from '../../../../../src/models';

describe('getSubscriptionBillingStatus', () => {
  before(() => clean());

  afterEach(() => clean());

  async function getBillingStatusWithRefund(
    refundStatus: Reimbursement['status'],
  ): Promise<FormattedBillingStatus> {
    const subscriptionBilling = await factory.create('subscription-billing');

    const payment = await factory.create('subscription-payment', {
      status: ExternalTransactionStatus.Completed,
    });

    await Promise.all([
      subscriptionBilling.addSubscriptionPayment(payment),
      factory.create('reimbursement', {
        subscriptionPaymentId: payment.id,
        status: refundStatus,
      }),
    ]);

    return await getSubscriptionBillingStatus(subscriptionBilling.id);
  }

  it('Returns ISSUE when the latest refund has failed', async () => {
    const statusWithCancelledRefund = await getBillingStatusWithRefund('CANCELED');
    const statusWithFailedRefund = await getBillingStatusWithRefund('FAILED');
    const statusWithReturnedRefund = await getBillingStatusWithRefund('RETURNED');

    expect(statusWithCancelledRefund).to.equal('ISSUE');
    expect(statusWithFailedRefund).to.equal('ISSUE');
    expect(statusWithReturnedRefund).to.equal('ISSUE');
  });

  it('Returns REFUNDED when the latest payment refund is successful or in progress', async () => {
    const statusWithCompletedRefund = await getBillingStatusWithRefund('COMPLETED');
    const statusWithPendingRefund = await getBillingStatusWithRefund('PENDING');
    const statusWithUnknownRefund = await getBillingStatusWithRefund('UNKNOWN');

    expect(statusWithCompletedRefund).to.equal('REFUNDED');
    expect(statusWithPendingRefund).to.equal('REFUNDED');
    expect(statusWithUnknownRefund).to.equal('REFUNDED');
  });

  it('Returns WAIVED when the amount is 0 and there is a waive-subscription modification', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.WaiveSubscription,
    });

    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const [dashboardActionLog, subscriptionBilling] = await Promise.all([
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: dashboardActionReason.id,
      }),
      factory.create('subscription-billing', { amount: 0 }),
    ]);

    await factory.create('dashboard-subscription-billing-modification', {
      subscriptionBillingId: subscriptionBilling.id,
      dashboardActionLogId: dashboardActionLog.id,
    });

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('WAIVED');
  });

  it('Returns FREE when the amount is 0 and the billing was not waived: no associated modifications', async () => {
    const subscriptionBilling = await factory.create('subscription-billing', { amount: 0 });

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('FREE');
  });

  it('Returns FREE when the amount is 0 and the billing was not waived: give-free-months association', async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: 'give-free-months',
    });

    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
    });

    const [dashboardActionLog, subscriptionBilling] = await Promise.all([
      factory.create('dashboard-action-log', {
        dashboardActionReasonId: dashboardActionReason.id,
      }),
      factory.create('subscription-billing', { amount: 0 }),
    ]);

    await factory.create('dashboard-subscription-billing-modification', {
      subscriptionBillingId: subscriptionBilling.id,
      dashboardActionLogId: dashboardActionLog.id,
    });
    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('FREE');
  });

  it('Returns ISSUE when the outstanding amount is negative: over billing', async () => {
    const subscriptionBilling = await factory.create('subscription-billing');

    const payment = await factory.create('subscription-payment', {
      status: ExternalTransactionStatus.Completed,
      amount: 2,
    });

    await subscriptionBilling.addSubscriptionPayment(payment);

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('ISSUE');
  });

  it('Returns ISSUE when the outstanding amount is negative: double billing', async () => {
    const subscriptionBilling = await factory.create('subscription-billing');

    const [payment1, payment2] = await Promise.all([
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
      }),
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
      }),
    ]);

    await Promise.all([
      subscriptionBilling.addSubscriptionPayment(payment1),
      subscriptionBilling.addSubscriptionPayment(payment2),
    ]);

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('ISSUE');
  });

  it('Returns PAID when the outstanding amount is 0', async () => {
    const subscriptionBilling = await factory.create('subscription-billing');

    const payment = await factory.create('subscription-payment', {
      status: ExternalTransactionStatus.Completed,
    });

    await subscriptionBilling.addSubscriptionPayment(payment);

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('PAID');
  });

  it('Returns UNCOLLECTABLE when all of the above conditions are false and the due date is more than forty days in the past', async () => {
    const subscriptionBilling = await factory.create('subscription-billing', {
      dueDate: () =>
        moment()
          .subtract(41, 'days')
          .format('YYYY-MM-DD'),
    });

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('UNCOLLECTABLE');
  });

  it('Returns PAST DUE when all of the above conditions are false and the due date is in the past', async () => {
    const [prettyLate, slightlyLate] = await Promise.all([
      factory.create('subscription-billing', {
        dueDate: () =>
          moment()
            .subtract(40, 'days')
            .format('YYYY-MM-DD'),
      }),
      factory.create('subscription-billing', {
        dueDate: () =>
          moment()
            .subtract(1, 'days')
            .format('YYYY-MM-DD'),
      }),
    ]);

    const [statusPrettyLate, statusSlightlyLate] = await Promise.all([
      getSubscriptionBillingStatus(prettyLate.id),
      getSubscriptionBillingStatus(slightlyLate.id),
    ]);

    expect(statusPrettyLate).to.equal('PAST DUE');
    expect(statusSlightlyLate).to.equal('PAST DUE');
  });

  it('Returns OPEN when all of the above conditions are false', async () => {
    const subscriptionBilling = await factory.create('subscription-billing');

    const status = await getSubscriptionBillingStatus(subscriptionBilling.id);

    expect(status).to.equal('OPEN');
  });
});
