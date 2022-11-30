import ErrorHelper from '@dave-inc/error-helper';

import * as SubscriptionBillingHelper from '../../helper/subscription-billing';

import { SubscriptionBilling } from '../../models';

import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';

import { SetSubscriptionDueDatePayload } from '../data';

enum Metric {
  Failed = 'set_subscription_due_date.failed',
  Succeeded = 'set_subscription_due_date.success',
}

/**
 * Task sets a subscription billing's due date to the next paycheck date connected to a user's primary bank account
 *
 * @param {number} subscriptionBillingId
 * @returns {Promise<void>}
 */
export async function setSubscriptionDueDate({
  subscriptionBillingId,
}: SetSubscriptionDueDatePayload): Promise<void> {
  const billing = await SubscriptionBilling.findByPk(subscriptionBillingId);

  if (!billing) {
    dogstatsd.increment(Metric.Failed, {
      reason: 'billing_not_found',
    });
    throw new Error(`Can't find subscription billing with id: ${subscriptionBillingId}`);
  }

  if (billing.dueDate) {
    dogstatsd.increment(Metric.Failed, {
      reason: 'due_date_already_set',
    });
    return;
  }

  try {
    await SubscriptionBillingHelper.setDueDate(billing);
  } catch (err) {
    logger.error('Task set-subscription-due-date failed to set due date', {
      subscriptionBillingId,
      err: ErrorHelper.logFormat(err),
    });
    dogstatsd.increment(Metric.Failed, {
      error_class: err.constructor.name,
      reason: 'set_due_date_errored',
    });
    return;
  }

  dogstatsd.increment(Metric.Succeeded);
}
