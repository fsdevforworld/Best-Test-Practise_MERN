import * as config from 'config';
import * as Bluebird from 'bluebird';
import { Tags } from 'hot-shots';
import * as _ from 'lodash';
import { Moment } from 'moment';
import * as Collection from '../../domain/collection';
import * as CollectionDomain from '../../domain/collection';
import { SUBSCRIPTION_COLLECTION_TRIGGER, SubscriptionChargeType } from '../../domain/collection';
import { DATADOG_METRIC_LABELS, dogstatsd } from '../../lib/datadog-statsd';
import {
  BankDataSourceRefreshError,
  BaseDaveApiError,
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  SubscriptionCollectionError,
} from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import { getAvailableOrCurrentBalance } from '../../lib/utils';
import {
  AuditLog,
  BankAccount,
  PaymentMethod as PaymentMethodModel,
  SubscriptionBilling,
  SubscriptionPayment,
} from '../../models';
import {
  BalanceCheckTrigger,
  BalanceLogCaller,
  BankAccountBalances,
  ExecutionResult,
  ExecutionStatus,
  ExternalPaymentCreator,
} from '../../typings';
import { BankingDataSource } from '@dave-inc/wire-typings';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import * as BankingDataSync from '../../domain/banking-data-sync';
import logger from '../../lib/logger';
import { CollectionFailures } from '../../domain/collection/enums';
import {
  createFallbackCharge as normalFallbackChargeCreator,
  FallbackChargeCreator,
} from '../../domain/collection/create-fallback-charge';

export const MIN_BALANCE_NEXT_DAY_ACH_FRIDAY = 500;
export const MIN_BALANCE_NEXT_DAY_ACH_MON_THUR = 200;
const DEFAULT_MIN_BALANCE = 10;
const DEBIT_MIN_BALANCE = 5;
export const preferAchBalanceThreshold = _.once(() => {
  return config.get<number>('subscriptions.preferAchBalanceThreshold');
});

const getBankAccountFailures = (bankAccountChargeCreationFailureException: any): string[] =>
  _.get(bankAccountChargeCreationFailureException, 'data.failures');

const recordCollectionFailureMetric = (collectionFailureReason: string, tags: Tags) => {
  tags = { ...tags, collection_failure_reason: collectionFailureReason };
  dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.collection_failure`, tags);
};

const recordBankAccountChargeCreationFailureMetric = (
  bankAccountChargeCreationFailureException: any,
  trigger: string,
) => {
  try {
    let failureReasonTags: Tags = { trigger };

    const failureReasons: string[] = getBankAccountFailures(
      bankAccountChargeCreationFailureException,
    );

    if (failureReasons) {
      let combinedFailureReason = '';
      failureReasons.forEach(failureReason => {
        // Individual failure reasons for overall aggregation
        failureReasonTags = { ...failureReasonTags, ['failed_' + failureReason]: failureReason };
        // Combined failure reasons for individual correlation
        combinedFailureReason += `${failureReason},`;
      });
      failureReasonTags = { ...failureReasonTags, failure_reasons_combined: combinedFailureReason };
    } else {
      failureReasonTags.failed_unknown_error = 'unknown_error';
    }

    dogstatsd.increment(
      `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.bank_account_charge_creation_failed`,
      failureReasonTags,
    );
  } catch (ex) {
    logger.error('Error processing subscription payment', { ex });
  }
};

const recordCollectionChargeTypeMetric = (
  chargeType: string,
  collectSubscriptionTask: CollectSubscriptionTask,
): void => {
  dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.charge_generated`, {
    chargeType,
    trigger: collectSubscriptionTask.trigger,
    accountBalanceBucket: collectSubscriptionTask.accountBalanceBucket,
  });
};

const getBalanceRange = (balance: number) => {
  const sortedBalanceRanges: number[] = [
    500,
    450,
    400,
    375,
    350,
    325,
    300,
    275,
    250,
    225,
    200,
    175,
    150,
    125,
    100,
    75,
    50,
    35,
    25,
    15,
    10,
    5,
    0,
  ];

  let actualBalanceRange;

  if (!balance) {
    actualBalanceRange = 'N/A';
  } else if (balance < 0) {
    actualBalanceRange = 'less than zero';
  } else {
    for (const balanceRange of sortedBalanceRanges) {
      if (balance >= balanceRange) {
        actualBalanceRange = balanceRange.toString();
        break;
      }
    }
  }

  return actualBalanceRange;
};

const recordBalanceRangeMetric = (
  accountBalance: number,
  balances: BankAccountBalances,
  wasBalanceCheckSkipped: boolean,
): void => {
  const actualBalanceUsedInCheck = getBalanceRange(accountBalance);

  dogstatsd.increment(
    `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.current_account_balance_range`,
    {
      accountBalanceAtLeast: actualBalanceUsedInCheck,
      balanceCheckSkipped: wasBalanceCheckSkipped.toString(),
    },
  );
};

function shouldApplyHighBalanceACHOverride(
  accountBalance: number,
  trigger: SUBSCRIPTION_COLLECTION_TRIGGER,
): boolean {
  return (
    accountBalance > preferAchBalanceThreshold() &&
    (trigger === SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB ||
      trigger === SUBSCRIPTION_COLLECTION_TRIGGER.USER_BANK_CONNECTED)
  );
}

export default class CollectSubscriptionTask {
  public static bucketAccountBalance(accountBalance?: number): string {
    return String(Math.floor(accountBalance / 5) * 5);
  }
  get accountBalanceBucket() {
    return CollectSubscriptionTask.bucketAccountBalance(this.accountBalance);
  }

  public subscriptionBilling: PromiseLike<SubscriptionBilling>;
  public time: Moment;
  public trigger: SUBSCRIPTION_COLLECTION_TRIGGER;
  public refreshBalanceTimeout: number;
  public logName: string;
  public caller: BalanceLogCaller;
  public skipBalanceCheck: boolean;
  public forceDebitOnly: boolean;
  private accountBalance?: number;
  private wasNextDayAchMinBalanceLowered: boolean = false;

  constructor(
    subscriptionBillingId: number,
    trigger: SUBSCRIPTION_COLLECTION_TRIGGER,
    time?: Moment,
    forceDebitOnly: boolean = false,
  ) {
    this.subscriptionBilling = SubscriptionBilling.findByPk(subscriptionBillingId);
    this.trigger = trigger;
    this.time = time;
    this.refreshBalanceTimeout = 240000;
    this.skipBalanceCheck = false;
    this.logName = 'SUBSCRIPTION_COLLECTION_JOB';
    this.caller = BalanceLogCaller.SubscriptionCollectionJob;
    this.forceDebitOnly = forceDebitOnly;
  }

  public async run(): Promise<ExecutionResult> {
    let subscriptionBilling: SubscriptionBilling;
    const start = moment();
    let isSuccess: boolean;
    try {
      dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.task_started`, {
        trigger: this.trigger,
      });

      subscriptionBilling = await this.subscriptionBilling;

      if (!subscriptionBilling) {
        throw new Error('No subscription billing found with this ID');
      }

      await this.validateRecentPaymentLimitEligibility(subscriptionBilling);

      const subscriptionPaymentId = await this.collect(normalFallbackChargeCreator);

      dogstatsd.increment(
        `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.collection_amount`,
        Number(subscriptionBilling.amount),
        { trigger: this.trigger },
      );

      logger.info('Subscription collection successful', {
        userId: subscriptionBilling?.userId,
        subscriptionBillingId: subscriptionBilling?.id,
        billingCycle: subscriptionBilling?.billingCycle,
        accountBalance: this.accountBalance,
      });

      await AuditLog.create({
        userId: subscriptionBilling.userId,
        type: this.logName,
        message: 'Collection successful',
        successful: true,
        eventUuid: subscriptionBilling.id,
        extra: {
          subscriptionPaymentId,
          billingCycle: subscriptionBilling.billingCycle,
          accountBalance: this.accountBalance,
        },
        trigger: this.trigger,
        accountBalance: this.accountBalance,
      });
      dogstatsd.increment(
        `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.task_completed_successfully`,
        {
          trigger: this.trigger,
          accountBalanceBucket: this.accountBalanceBucket,
        },
      );
      isSuccess = true;
    } catch (err) {
      logger.warn('Caught error processing subscription', {
        error: err,
        userId: subscriptionBilling?.userId,
        subscriptionBillingId: subscriptionBilling?.id,
        billingCycle: subscriptionBilling?.billingCycle,
        accountBalance: this.accountBalance,
      });

      await AuditLog.create({
        userId: subscriptionBilling ? subscriptionBilling.userId : -1,
        type: this.logName,
        message: err.message || err.errorCode,
        successful: false,
        eventUuid: subscriptionBilling ? subscriptionBilling.id : undefined,
        extra: {
          err,
          billingCycle: subscriptionBilling?.billingCycle,
          accountBalance: this.accountBalance,
        },
        trigger: this.trigger,
        accountBalance: this.accountBalance,
      });

      dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.task_failed`, {
        trigger: this.trigger,
        accountBalanceBucket: this.accountBalanceBucket,
      });

      isSuccess = false;

      if (
        err &&
        err instanceof BankDataSourceRefreshError &&
        err.customCode === CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT
      ) {
        if (err.source === BankingDataSource.Plaid) {
          // nack on rate limit so we retry immediately
          dogstatsd.increment('subscription_collection.rate_limit_retry', {
            source: err.source,
          });
          return {
            status: ExecutionStatus.FailureDoNotRetry,
            failures: [{ message: 'plaid_rate_limit' }],
          };
        } else if (err.source === BankingDataSource.Mx) {
          // don't retry mx rate limits since their rate limits are 4 hours
          dogstatsd.increment('subscription_collection.rate_limit_pass', {
            source: err.source,
          });
        }
      }
    } finally {
      const durationSeconds = moment().diff(start, 'seconds');
      const tags = { isSuccess: isSuccess.toString(), trigger: this.trigger };
      dogstatsd.histogram(
        `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.task_duration_seconds`,
        durationSeconds,
        tags,
      );

      if (this.wasNextDayAchMinBalanceLowered) {
        dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.experiment`, {
          experiment: `lower_next_day_ach_balance_${MIN_BALANCE_NEXT_DAY_ACH_MON_THUR}`,
          was_collected: isSuccess.toString(),
          trigger: this.trigger,
        });
      }
    }
  }

  public async collect(createFallbackCharge: FallbackChargeCreator) {
    dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.collect_begin`, {
      trigger: this.trigger,
    });

    const billing = await this.subscriptionBilling;
    const [charge, chargeType] = await this.createCharge(createFallbackCharge);

    const attempt = await Collection.collectSubscription(
      billing,
      charge,
      chargeType,
      this.trigger,
      this.time,
      this.accountBalance,
    );

    await attempt.reload({ include: [SubscriptionPayment] });

    if (!attempt.subscriptionPayment || !attempt.subscriptionPayment.isPaid()) {
      if (!attempt.subscriptionPayment) {
        recordCollectionFailureMetric('charged_but_charge_attempt_missing', {
          trigger: this.trigger,
          accountBalanceBucket: this.accountBalanceBucket,
        });
      } else if (!attempt.subscriptionPayment.isPaid()) {
        recordCollectionFailureMetric('charged_but_status_not_paid', {
          trigger: this.trigger,
          accountBalanceBucket: this.accountBalanceBucket,
          payment_status: attempt.subscriptionPayment.status,
        });
      }
      throw new SubscriptionCollectionError('Collection attempt was unsuccessful');
    }

    return attempt.subscriptionPaymentId;
  }

  public async createCharge(
    createFallbackCharge: FallbackChargeCreator,
  ): Promise<[ExternalPaymentCreator, SubscriptionChargeType]> {
    dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.createCharge_begin`, {
      trigger: this.trigger,
    });

    let minBalance = DEFAULT_MIN_BALANCE;

    const billing = await this.subscriptionBilling;
    const bankAccount = await Collection.getBankAccountToCharge(billing);

    if (!bankAccount) {
      recordCollectionFailureMetric('no_bank_account', { trigger: this.trigger });
      throw new SubscriptionCollectionError('No supported bank accounts');
    }

    const {
      isInSameDayACHCollectionWindow,
      isInNextDayACHCollectionWindow,
    } = Collection.isInACHCollectionWindows(this.time);

    let bankChargeCreationException;
    let bankAccountCharge = await CollectionDomain.createBankAccountSubscriptionCharge(
      bankAccount,
      {
        shouldCheckACHWindow: false,
      },
    ).catch(ex => {
      bankChargeCreationException = ex;
      return null;
    });

    if (!isInSameDayACHCollectionWindow) {
      bankChargeCreationException = this.addOutsideACHWindowToBankChargeCreationException(
        bankChargeCreationException,
      );
    }

    if (bankChargeCreationException) {
      recordBankAccountChargeCreationFailureMetric(bankChargeCreationException, this.trigger);
    }

    const debitCardCharge = await this.createDebitCardCharge(bankAccount);
    if (debitCardCharge) {
      minBalance = DEBIT_MIN_BALANCE;
    }

    if (debitCardCharge || bankAccountCharge) {
      this.accountBalance = await this.getValidatedAccountBalance(
        bankAccount,
        minBalance,
        this.skipBalanceCheck,
      );
    }

    const isEligibleForSameDayACH = bankAccountCharge != null && isInSameDayACHCollectionWindow;
    const isEligibleForNextDayACH =
      bankAccountCharge != null &&
      isInNextDayACHCollectionWindow &&
      this.isMinBalanceForAch(this.accountBalance);

    if (isEligibleForNextDayACH) {
      bankAccountCharge = _.partialRight(bankAccountCharge, { isSameDay: false });
    }

    let charge: ExternalPaymentCreator;
    let chargeTypeChosen = SubscriptionChargeType.None;

    if (this.forceDebitOnly) {
      if (debitCardCharge) {
        charge = debitCardCharge;
        chargeTypeChosen = SubscriptionChargeType.ForcedDebitCharge;
      } else {
        recordCollectionFailureMetric('debit_only_failed', { trigger: this.trigger });
        throw new Error(
          'Cannot charge debit with forceDebitOnly = true in subscription payment processor',
        );
      }
    } else if (shouldApplyHighBalanceACHOverride(this.accountBalance, this.trigger)) {
      chargeTypeChosen = SubscriptionChargeType.HighBalanceForceAch;
      if (debitCardCharge) {
        charge = createFallbackCharge(bankAccountCharge, debitCardCharge, async _ex => true);
      } else {
        charge = bankAccountCharge;
      }
    } else if (debitCardCharge && isEligibleForNextDayACH) {
      chargeTypeChosen = SubscriptionChargeType.DebitAndBankNextDayAch;
      charge = createFallbackCharge(bankAccountCharge, debitCardCharge, async _ex => true);
    } else if (debitCardCharge && isEligibleForSameDayACH && this.accountBalance > 10) {
      dogstatsd.increment(
        `${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.createCharge_conditionalFallback`,
        {
          trigger: this.trigger,
          accountBalanceBucket: this.accountBalanceBucket,
        },
      );
      chargeTypeChosen = SubscriptionChargeType.DebitAndBankSameDayAch;
      const highRiskTriggers = [
        SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
        SUBSCRIPTION_COLLECTION_TRIGGER.PAST_DUE_RECENT_ACCOUNT_UPDATE_JOB,
        SUBSCRIPTION_COLLECTION_TRIGGER.USER_BALANCE_REFRESH,
      ];
      const highRiskAchlimit = 100;
      charge = createFallbackCharge(debitCardCharge, bankAccountCharge, async ex => {
        dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.fallback_validator`, {
          trigger: this.trigger,
        });
        const isInsufficientFundsError = Collection.isInsufficientFundsError(ex);
        const isUnknownError = Collection.isUnknownPaymentProcessorError(ex);
        const tooRiskyToFallback =
          this.accountBalance < highRiskAchlimit && highRiskTriggers.includes(this.trigger);

        const shouldTryFallbackCharge =
          !isInsufficientFundsError && !isUnknownError && !tooRiskyToFallback;

        dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.fallback_decision`, {
          trigger: this.trigger,
          accountBalanceBucket: this.accountBalanceBucket,
          shouldTryFallbackCharge: String(shouldTryFallbackCharge),

          isInsufficientFundsError: String(isInsufficientFundsError),
          isUnknownError: String(isUnknownError),
          tooRiskyToFallback: String(tooRiskyToFallback),
        });

        return shouldTryFallbackCharge;
      });
    } else if (debitCardCharge) {
      chargeTypeChosen = SubscriptionChargeType.DebitChargeOnly;
      charge = debitCardCharge;
    } else if (isEligibleForNextDayACH) {
      chargeTypeChosen = SubscriptionChargeType.BankChargeOnlyNextDayAch;
      charge = bankAccountCharge;
    } else if (isEligibleForSameDayACH) {
      chargeTypeChosen = SubscriptionChargeType.BankChargeOnly;
      charge = bankAccountCharge;
    } else {
      recordCollectionFailureMetric('no_debit_or_bank_charge_created', { trigger: this.trigger });
      throw bankChargeCreationException;
    }

    recordCollectionChargeTypeMetric(chargeTypeChosen, this);
    return [charge, chargeTypeChosen];
  }

  private isMinBalanceForAch(accountBalance: number) {
    const isFriday = moment().day() === 5;
    const minBalance = isFriday
      ? MIN_BALANCE_NEXT_DAY_ACH_FRIDAY
      : MIN_BALANCE_NEXT_DAY_ACH_MON_THUR;

    const isMinBalance = accountBalance >= minBalance;

    // Tracking only (is this only valid because we changed threshold mon-thur)
    if (!isFriday && isMinBalance && accountBalance <= MIN_BALANCE_NEXT_DAY_ACH_FRIDAY) {
      this.wasNextDayAchMinBalanceLowered = true;
    }

    return isMinBalance;
  }

  private addOutsideACHWindowToBankChargeCreationException(bankChargeCreationException: any) {
    bankChargeCreationException =
      bankChargeCreationException ||
      new InvalidParametersError('Bank account ineligible for collection');
    const bankAccountFailureReasons = getBankAccountFailures(bankChargeCreationException) || [];
    bankAccountFailureReasons.push(CollectionFailures.TimeOutsideACHCollection);
    _.set(bankChargeCreationException, 'data.failures', bankAccountFailureReasons);
    return bankChargeCreationException;
  }

  private async createDebitCardCharge(bankAccount: BankAccount) {
    let debitCardCharge: ExternalPaymentCreator;
    const loomisResponse = await loomisClient.getPaymentMethod({
      id: bankAccount.defaultPaymentMethodId,
    });
    const debitCard = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    if (debitCard) {
      const cardIsExpired = await this.validateCardExpiration(debitCard);
      if (!cardIsExpired) {
        debitCardCharge = Collection.createDebitCardSubscriptionCharge(debitCard);
      }
    }
    return debitCardCharge;
  }

  private async validateCardExpiration(debitCard: PaymentMethod) {
    const isCardExpired = moment(debitCard.expiration).endOf('month') < moment().endOf('month');

    if (isCardExpired) {
      const debitCardModel = await PaymentMethodModel.findByPk(debitCard.id);
      await debitCardModel.invalidate('54'); // Expired code

      dogstatsd.increment(`${DATADOG_METRIC_LABELS.SUBSCRIPTION_COLLECTION}.card_marked_expired`, {
        trigger: this.trigger,
      });

      const bill = await this.subscriptionBilling;
      await AuditLog.create({
        userId: bill.userId,
        type: this.logName,
        message: 'Payment method marked as expired',
        successful: true,
        eventUuid: bill.id,
        extra: {
          paymentMethodId: debitCard.id,
          billingCycle: bill.billingCycle,
        },
      });
    }

    return isCardExpired;
  }

  private async validateRecentPaymentLimitEligibility(subscriptionBilling: SubscriptionBilling) {
    const {
      isEligible: isWithinCollectionTimeframe,
    } = await CollectionDomain.isSubscriptionWithinCollectionTimeframe(subscriptionBilling);

    if (!isWithinCollectionTimeframe) {
      recordCollectionFailureMetric('bill_too_old', {
        trigger: this.trigger,
      });
      throw new SubscriptionCollectionError('Bill is too old to collect');
    }
  }

  private async getValidatedAccountBalance(
    account: BankAccount,
    minBalance: number = DEFAULT_MIN_BALANCE,
    skipBalanceCheck = false,
  ): Promise<number> {
    let balances: BankAccountBalances;
    if (skipBalanceCheck) {
      balances = {
        available: account.available,
        current: account.current,
      };
    } else {
      const refresh = BankingDataSync.refreshBalance(account, {
        reason: BalanceCheckTrigger.SUBSCRIPTION_COLLECTION,
        caller: this.caller,
      });

      try {
        balances = await Bluebird.resolve(refresh).timeout(
          this.refreshBalanceTimeout,
          'Plaid balance check timed out',
        );
      } catch (ex) {
        let accountBalanceRefreshTags: Tags = { trigger: this.trigger };

        if (ex instanceof BaseDaveApiError) {
          accountBalanceRefreshTags = {
            ...accountBalanceRefreshTags,
            errorMessage: ex.message,
            errorStatusCode: ex.statusCode.toString(),
          };
        }
        recordCollectionFailureMetric('account_balance_refresh_failed', accountBalanceRefreshTags);
        throw ex;
      }
    }

    const balance = getAvailableOrCurrentBalance(balances);

    recordBalanceRangeMetric(balance, balances, this.skipBalanceCheck);

    if (balance < minBalance) {
      const isBalaneAboveDebitMinBalance = (balance >= DEBIT_MIN_BALANCE).toString();
      const minBalanceTags = {
        trigger: this.trigger,
        minBalanceUsedToCheck: minBalance.toString(),
        isBalaneAboveDebitMinBalance,
      };
      recordCollectionFailureMetric('account_balance_too_low', minBalanceTags);
      throw new SubscriptionCollectionError('Balance too low to attempt collection', {
        data: { balance },
      });
    }

    return balance;
  }
}
