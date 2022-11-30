import {
  BankAccount,
  SubscriptionBilling,
  SubscriptionCollectionAttempt,
  SubscriptionPayment,
  sequelize,
} from '../../models';
import { ChargeableMethod, ExternalPayment, ExternalPaymentCreator } from '../../typings';
import { ConflictError } from '../../lib/error';
import { attemptChargeAndRecordProcessorError } from './payment-processor';
import {
  DATADOG_METRIC_LABELS,
  dogstatsd,
  executeAndRecordSuccessToDatadog,
  getChargeFailureErrorTag,
} from '../../lib/datadog-statsd';
import { BroadcastSubscriptionPayment } from '../../jobs';
import { generateRandomHexString } from '../../lib/utils';
import { BankingDataSource, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Tags } from 'hot-shots';
import { moment } from '@dave-inc/time-lib';
import * as momentWithoutTimezone from 'moment';
import { Moment } from 'moment';
import { Op, QueryTypes } from 'sequelize';
import logger from '../../lib/logger';
import { collectPastDueSubscriptionTask } from '../../jobs/data';
import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { publishPaymentCreationEvent } from '../payment';
import { SubscriptionChargeType } from './enums';

// NOTE: Work in progress. As I continue to refactor Subscription Collections, the correct pattern will emerge.
type EligibilityRuleResult<T = any> = T & {
  isEligible: boolean;
};

export const MAX_BILL_AGE_DAYS = 40;
export const MAX_BILL_AGE_MONTHS = 1;

type BankAccountQueryResult = {
  id: number;
  isDefaultAccount: boolean;
  hasValidCredentials: boolean;
  hasValidPaymentMethod: boolean;
  paymentMethodId: number;
};

const DATADOG_METRIC_LABEL = 'subscription_payment';
const COLLECT_PAST_DUE_DATADOG_METRIC_LABEL = `${DATADOG_METRIC_LABEL}.collect_past_due`;

export enum SUBSCRIPTION_COLLECTION_TRIGGER {
  DAILY_JOB = 'daily-cronjob',
  BANK_ACCOUNT_UPDATE = 'bank-account-update',
  USER_BALANCE_REFRESH = 'user-balance-refresh',
  USER_BANK_CONNECTED = 'user-bank-connected',
  USER_BANK_RECONNECTED = 'user-bank-reconnected',
  PAST_DUE_RECENT_ACCOUNT_UPDATE_JOB = 'past_due_recent_account_update',
  PREDICTED_PAYDAY_JOB = 'predicted-payday',
  ADMIN_SCRIPT = 'admin-script',
}

export async function collectSubscription(
  subscriptionBilling: SubscriptionBilling,
  charge: ExternalPaymentCreator,
  chargeType: SubscriptionChargeType,
  trigger: string,
  time?: Moment,
  accountBalance?: number,
): Promise<SubscriptionCollectionAttempt> {
  dogstatsd.increment(
    `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.collectSubscription_begin`,
    {
      trigger: this.trigger,
    },
  );
  const collectionAttempt = await createCollectionAttempt(subscriptionBilling, trigger, chargeType);

  let payment: SubscriptionPayment;
  let externalPayment: ExternalPayment;
  try {
    await subscriptionBilling.reload();

    const isPaid = await subscriptionBilling.isPaid();
    const amount = subscriptionBilling.amount;

    if (isPaid) {
      recordCollectionFailureMetric('subscription_already_paid', { trigger });
      throw new ConflictError('Subscription has already been paid');
    }

    payment = await initializeSubscriptionPayment(subscriptionBilling);
    externalPayment = await attemptChargeAndRecordProcessorError(
      charge,
      amount,
      payment,
      DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION,
      time,
    );

    payment = await recordExternalSubscriptionPayment(payment, externalPayment);

    await Promise.all([
      publishPaymentCreationEvent(PaymentProviderTransactionType.SubscriptionPayment, payment),
      collectionAttempt.setSubscriptionPayment(payment),
      subscriptionBilling.addSubscriptionPayment(payment),
    ]);

    await BroadcastSubscriptionPayment.add({ subscriptionPaymentId: payment.id }).catch(ex => {
      logger.error('Error Broadcasting sub payment', { ex });
    });
  } catch (ex) {
    let tags: Tags = {
      trigger,
    };

    if (payment) {
      await Promise.all([
        collectionAttempt.setSubscriptionPayment(payment),
        subscriptionBilling.addSubscriptionPayment(payment),
      ]);
      if (externalPayment) {
        recordCollectionFailureMetric('charged_successfully_but_failed_to_record', tags);
      } else {
        tags = { ...tags, ...getChargeFailureErrorTag(ex) };
        recordCollectionFailureMetric('failed_charging_payment', tags);
      }
    } else {
      recordCollectionFailureMetric('failed_generating_payment_before_charging', tags);
    }
    logger.error('Error collecting subscription', { ex });

    collectionAttempt.set('extra', { ...collectionAttempt.extra, err: ex });

    await collectionAttempt.save();
  } finally {
    await collectionAttempt.update({ processing: null });
  }

  return collectionAttempt;
}

async function initializeSubscriptionPayment(
  subscriptionBilling: SubscriptionBilling,
): Promise<SubscriptionPayment> {
  const referenceId = generateRandomHexString(15);
  const subscriptionPayment = await SubscriptionPayment.create({
    amount: subscriptionBilling.amount,
    userId: subscriptionBilling.userId,
    referenceId,
    status: ExternalTransactionStatus.Pending,
  });
  return subscriptionPayment;
}

async function createCollectionAttempt(
  billing: SubscriptionBilling,
  trigger: string,
  chargeType: SubscriptionChargeType,
) {
  try {
    const collectionAttempt = await SubscriptionCollectionAttempt.create({
      subscriptionBillingId: billing.id,
      trigger,
      extra: {
        chargeType,
      },
    });

    return collectionAttempt;
  } catch (ex) {
    recordCollectionFailureMetric('collection_already_in_progress', { trigger });
    throw new ConflictError('Collection already in progress', ex);
  }
}

export async function recordExternalSubscriptionPayment(
  subscriptionPayment: SubscriptionPayment,
  externalPayment: ExternalPayment,
) {
  if (externalPayment == null) {
    dogstatsd.increment(
      `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.record_external_payment.unknown_error`,
    );
    return subscriptionPayment;
  }

  const {
    type,
    chargeable,
    amount,
    id: externalId,
    status: externalStatus,
    processor: externalProcessor,
  } = externalPayment;

  let bankAccountId;
  let paymentMethodId;

  switch (type) {
    case ChargeableMethod.Ach:
      bankAccountId = chargeable.id;
      break;
    case ChargeableMethod.DebitCard:
      paymentMethodId = chargeable.id;
      break;
    default:
      logger.warn('Unexpected subscription payment charge method', { type });
  }

  return subscriptionPayment.update({
    userId: chargeable.userId,
    bankAccountId,
    paymentMethodId,
    amount,
    externalId,
    status: externalStatus,
    externalProcessor,
  });
}

export function getMinimumDueDateToCollect() {
  // Rule: Must be within 40 days (inclusive)
  const oldestDueDateWithin40days: Moment = moment()
    .subtract(MAX_BILL_AGE_DAYS, 'days')
    .startOf('day');

  // Rule: Must be no older than 1 month (visually for user, e.g. feb vs april)
  const oldestDueDateWithin1Month: Moment = moment()
    .subtract(MAX_BILL_AGE_MONTHS, 'month')
    .startOf('month');

  return momentWithoutTimezone.max([oldestDueDateWithin40days, oldestDueDateWithin1Month]);
}

/**
 * Check if paying this subscription billing is within a valid collection timeframe
 * @param subscriptionBilling The bill to pay
 * @param time The point in time to recent payments against (optional) (e.g.)
 */
export function isSubscriptionWithinCollectionTimeframe(
  subscriptionBilling: SubscriptionBilling,
): EligibilityRuleResult {
  return { isEligible: subscriptionBilling.dueDate >= getMinimumDueDateToCollect() };
}

export async function getBankAccountToCharge(billing: SubscriptionBilling): Promise<BankAccount> {
  const eligibleAccounts: BankAccountQueryResult[] = await sequelize.query(
    `
    SELECT
      bank_account.id,
      user.default_bank_account_id = bank_account.id as isDefaultAccount,
      bank_connection.has_valid_credentials as hasValidCredentials,
      payment_method.id IS NOT NULL as hasValidPaymentMethod,
      payment_method.id as paymentMethodId
    FROM user
    INNER JOIN bank_account ON
      bank_account.user_id = user.id
    INNER JOIN bank_connection ON
      bank_connection.id = bank_account.bank_connection_id
    LEFT JOIN payment_method ON
      payment_method.bank_account_id = bank_account.id AND
      payment_method.invalid IS NULL AND
      payment_method.deleted IS NULL
    WHERE
      user.id = ? AND
      bank_connection.banking_data_source != ? AND
      bank_account.deleted IS NULL AND
      type = 'DEPOSITORY'
    `,
    { replacements: [billing.userId, BankingDataSource.BankOfDave], type: QueryTypes.SELECT },
  );

  if (eligibleAccounts.length === 0) {
    return null;
  }

  const sortedAccounts = eligibleAccounts.sort(sortByChargeability);

  return BankAccount.findByPk(sortedAccounts[0].id);
}

export async function collectPastDueSubscriptionPayment(options: {
  userId: number;
  trigger: SUBSCRIPTION_COLLECTION_TRIGGER;
  wasBalanceRefreshed: boolean;
}): Promise<void> {
  try {
    // Avoid unnecessary queue processing
    if (!(await hasPastDueBilling(options.userId))) {
      return;
    }

    const tags = {
      trigger: options.trigger,
      was_balance_refreshed: options.wasBalanceRefreshed.toString(),
    };
    const addingJobMetricLabel = `${COLLECT_PAST_DUE_DATADOG_METRIC_LABEL}.adding_job`;
    await executeAndRecordSuccessToDatadog(
      addingJobMetricLabel,
      async () =>
        collectPastDueSubscriptionTask({
          userId: options.userId,
          trigger: options.trigger,
          shouldSkipBalanceCheck: options.wasBalanceRefreshed,
        }),
      tags,
    );
  } catch (error) {
    logger.error('Error enqueuing collect subscription job', { error });
  }
}

function sortByChargeability(a: BankAccountQueryResult, b: BankAccountQueryResult): number {
  if (a.isDefaultAccount !== b.isDefaultAccount) {
    return a.isDefaultAccount ? -1 : 1;
  }

  if (a.hasValidCredentials !== b.hasValidCredentials) {
    return a.hasValidCredentials ? -1 : 1;
  }

  if (a.hasValidPaymentMethod !== b.hasValidPaymentMethod) {
    return a.hasValidPaymentMethod ? -1 : 1;
  }

  return 0;
}

export async function getPastDueBilling(userId: number) {
  const pastDueBillings = await SubscriptionBilling.scope('unpaid').findAll({
    where: {
      userId,
      dueDate: {
        [Op.and]: [
          { [Op.lt]: moment() },
          {
            [Op.gte]: getMinimumDueDateToCollect().format('YYYY-MM-DD'),
          },
        ],
      },
    },
    order: [['id', 'asc']],
  });

  return pastDueBillings[0];
}

export async function hasPastDueBilling(userId: number) {
  return getPastDueBilling(userId) != null;
}

const recordCollectionFailureMetric = (collectionFailureReason: string, tags: Tags) => {
  tags = { ...tags, collection_failure_reason: collectionFailureReason };
  dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.collection_failure`, tags);
};
