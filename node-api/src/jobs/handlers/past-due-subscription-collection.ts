import { moment } from '@dave-inc/time-lib';
import { getAvailableOrCurrentBalance, isProdEnv } from '../../lib/utils';
import { BankAccount } from '../../models';
import { getBankAccountToCharge, getPastDueBilling } from '../../domain/collection';
import CollectSubscriptionTask from '../../consumers/subscription-payment-processor/task';
import { BalanceLogCaller } from '../../typings';
import { dogstatsd, executeAndRecordSuccessToDatadog } from '../../lib/datadog-statsd';
import { PastDueSubscriptionCollectionData } from '../data';

const DATA_DOG_METRIC_LABEL = 'past-due-subscription-collection';

export async function collectPastDueSubscription(
  data: PastDueSubscriptionCollectionData,
): Promise<void> {
  const { userId, trigger, shouldSkipBalanceCheck, time } = data;
  const momentTime = time && !isProdEnv() ? moment(time) : moment();

  const unpaidBilling = await getUnpaidBilling(userId);
  if (!unpaidBilling) {
    return;
  }

  const collectionTask = new CollectSubscriptionTask(unpaidBilling.id, trigger, momentTime);
  collectionTask.logName = BalanceLogCaller.PastDueSubscriptionCollection;
  collectionTask.skipBalanceCheck = shouldSkipBalanceCheck;

  const collectionAttemptMetricLabel = `${DATA_DOG_METRIC_LABEL}.collection_attempt`;
  await executeAndRecordSuccessToDatadog(collectionAttemptMetricLabel, () => collectionTask.run());
}

async function isBelowMinBalanceForCollection(chargeAccount: BankAccount): Promise<boolean> {
  let minBalanceForCollection = 5;
  const debitCard = await chargeAccount.getDefaultPaymentMethod();
  const isDebitCardIneligible = debitCard == null || debitCard.invalid != null;
  if (isDebitCardIneligible) {
    minBalanceForCollection = 10;
  }
  const isBelowMinBalance =
    getAvailableOrCurrentBalance(chargeAccount.balances) < minBalanceForCollection;

  if (isBelowMinBalance) {
    dogstatsd.increment(`${DATA_DOG_METRIC_LABEL}.collection_not_possible`, {
      reason: 'balance_too_low',
      min_balance_checked: minBalanceForCollection.toString(),
    });
  }
  return isBelowMinBalance;
}

export async function getUnpaidBilling(userId: number) {
  const unpaidBilling = await getPastDueBilling(userId);

  if (!unpaidBilling) {
    dogstatsd.increment(`${DATA_DOG_METRIC_LABEL}.collection_not_possible`, {
      reason: 'not_necessary_no_unpaid',
    });
    return;
  }

  const chargeAccount = await getBankAccountToCharge(unpaidBilling);
  if (!chargeAccount) {
    dogstatsd.increment(`${DATA_DOG_METRIC_LABEL}.collection_not_possible`, {
      reason: 'no_bank_account_to_charge',
    });
    return;
  }

  if (await isBelowMinBalanceForCollection(chargeAccount)) {
    return;
  }

  return unpaidBilling;
}
