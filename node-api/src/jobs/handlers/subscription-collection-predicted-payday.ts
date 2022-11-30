import { Tags } from 'hot-shots';
import loomisClient from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { BankAccount, SubscriptionBilling } from '../../models';
import * as RecurringTransactionDomain from '../../domain/recurring-transaction';
import { SubscriptionChargeType, SUBSCRIPTION_COLLECTION_TRIGGER } from '../../domain/collection';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as CollectionDomain from '../../domain/collection';
import logger from '../../lib/logger';
import { SubscriptionCollectionPredictedPaydayQueueData } from '../data';

const DATADOG_METRIC_LABEL = 'subscription-collection-predicted-payday';

export async function subscriptionCollectionPredictedPayday(
  data: SubscriptionCollectionPredictedPaydayQueueData,
): Promise<void> {
  let jobStatus = 'failed_to_collect';
  let failureReason: string;
  try {
    const { subscriptionBillingId, bankAccountId, recurringTransactionId } = data;
    const triggerName = SUBSCRIPTION_COLLECTION_TRIGGER.PREDICTED_PAYDAY_JOB;

    const bankAccount = await BankAccount.findByPk(bankAccountId);

    if (!bankAccount) {
      failureReason = 'no_bank_account';
      return;
    }

    const recurringIncome = await RecurringTransactionDomain.getById(recurringTransactionId);

    if (!recurringIncome) {
      failureReason = 'paycheck_not_found';
      return;
    }

    const nextPayday = recurringIncome.rsched.after(moment().startOf('day'), true);
    const isPredictedPaydayNotToday = !nextPayday.isSame(moment(), 'day');
    if (isPredictedPaydayNotToday) {
      failureReason = 'predicted_payday_is_not_today';
      return;
    }

    const billing = await SubscriptionBilling.findByPk(subscriptionBillingId);

    const {
      isEligible: isWithinCollectionTimeframe,
    } = await CollectionDomain.isSubscriptionWithinCollectionTimeframe(billing);
    if (!isWithinCollectionTimeframe) {
      failureReason = 'bill_too_old';
      return;
    }

    const loomisResponse = await loomisClient.getPaymentMethod({
      id: bankAccount.defaultPaymentMethodId,
    });
    if ('error' in loomisResponse) {
      throw new Error(
        `Loomis gave an error in subscriptionCollectionPredictedPayday ${loomisResponse.error.message}`,
      );
    }
    const debitCard = loomisResponse.data;

    const debitCardCharge = CollectionDomain.createDebitCardSubscriptionCharge(debitCard);

    await CollectionDomain.collectSubscription(
      billing,
      debitCardCharge,
      SubscriptionChargeType.DebitChargeOnly,
      triggerName,
    );
    jobStatus = 'successful_collection';
  } catch (ex) {
    logger.error('Error collecting predicted payday', { ex });
    jobStatus = 'threw_error';
  } finally {
    let tags: Tags = { job_status: jobStatus };
    if (failureReason) {
      tags = { ...tags, failure_reason: failureReason };
    }
    dogstatsd.increment(`${DATADOG_METRIC_LABEL}.attempt_collection`, tags);
  }
}
