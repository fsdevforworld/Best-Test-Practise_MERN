import * as Bluebird from 'bluebird';

import { ABTestingEvent, AuditLog, BankAccount, Advance, Payment } from '../../models';
import {
  AdvanceCollectionTrigger,
  BalanceCheckTrigger,
  BankAccountBalances,
  PaymentSource,
} from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import UserHelper from '../../helper/user';
import { BalanceLogCaller } from '../../typings';
import { createFallbackFromDebitCardToBankAccount } from './charge';
import { getRetrievalAmount } from './outstanding';
import { collectAdvance } from './collect-advance';
import { createACHCollectionTask } from '../../jobs/data';
import { getNextACHCollectionTime } from './ach';
import * as BankingDataSync from '../banking-data-sync';
import { Moment } from 'moment';
import loomisClient from '@dave-inc/loomis-client';
import { TIVAN_AB_TESTING_EVENT } from '../../experiments/tivan-cloud-task-experiment';
import logger from '../../lib/logger';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import { CollectionFailures } from './enums';

export enum CollectionStatus {
  Success = 'success',
  Failure = 'failure',
}

/**
 * This task is responsible for auto-collecting advances that are ready to collect
 *
 * We first attempt to collect any retrievable amount from the advance's primary payment method
 * And then we attempt to collect from every other primary bank account on file for the user
 */
class RefreshBalanceAndCollect {
  public advance: Advance;
  public retrieveFullOutstanding: boolean;
  public refreshBalanceTimeout: number;
  public logName: string;
  public caller: BalanceLogCaller;
  public time: Moment;

  constructor(
    advance: Advance,
    {
      retrieveFullOutstanding = false,
      refreshBalanceTimeout = 240000,
      logName = 'DAILY_AUTO_RETRIEVE_JOB',
      caller = BalanceLogCaller.DailyAutoRetrieveJob,
      time = undefined as Moment,
    } = {},
  ) {
    this.advance = advance;
    this.refreshBalanceTimeout = refreshBalanceTimeout;
    this.retrieveFullOutstanding = retrieveFullOutstanding;
    this.logName = logName;
    this.caller = caller;
    this.time = time;
  }

  /**
   * Fetches the available balance for the given bank account
   *
   * @param {BankAccount} bankAccount
   * @returns {Promise<BankAccountBalances>}
   */
  public getBalances(bankAccount: BankAccount): PromiseLike<BankAccountBalances> {
    return Bluebird.resolve(
      BankingDataSync.refreshBalance(bankAccount, {
        reason: BalanceCheckTrigger.ADVANCE_COLLECTION,
        advanceId: this.advance.id,
        caller: this.caller,
      }),
    ).timeout(this.refreshBalanceTimeout, 'BankingDataSource balance check timed out');
  }

  /**
   * Runs the collection task
   *
   * @returns {Promise<{status: CollectionStatus, payments?: Payment[]}>}
   */
  public async run(): Promise<{
    status: CollectionStatus;
    payments?: Payment[];
    error?: any;
  }> {
    dogstatsd.increment('advance_collection.task_triggered');

    try {
      const shouldUseTivan =
        (await ABTestingEvent.count({
          where: { eventUuid: this.advance.id, eventName: TIVAN_AB_TESTING_EVENT },
        })) >= 1;

      if (shouldUseTivan) {
        dogstatsd.increment('advance_collection.deferred_to_tivan');

        return;
      }

      const { payments, error } = await this.collectFromAllPaymentOptions();

      if (error) {
        return { status: CollectionStatus.Failure, error };
      }

      const totalCollected = payments.reduce((sum, payment) => sum + payment.amount, 0);
      await this.logResult(
        true,
        `Created ${payments.length} payments totalling $${totalCollected}`,
        { payments },
      );

      return { status: CollectionStatus.Success, payments };
    } catch (err) {
      await this.logResult(false, err.message || err.errorCode, { err });

      return { status: CollectionStatus.Failure, error: err };
    }
  }

  /**
   * Fetches a list of valid payment options for this advance (bank account & debit card)
   *
   * @returns {Promise<PaymentSource[]>}
   */
  public async getAllPaymentSources(): Promise<PaymentSource[]> {
    const { paymentMethodId: id } = this.advance;

    return [
      // First try collecting from the payment methods used in the advance
      {
        bankAccount:
          this.advance.bankAccount || (await this.advance.getBankAccount({ paranoid: false })),
        debitCard: parseLoomisGetPaymentMethod(
          await loomisClient.getPaymentMethod({ id, includeSoftDeleted: true }),
          __filename,
        ),
      },
      // Attempt from all other primary bank accounts
      ...(
        await UserHelper.getAllPrimaryPaymentSources(this.advance.userId, {
          paranoid: false,
        })
      ).filter(({ bankAccount }) => bankAccount.id !== this.advance.bankAccountId),
    ];
  }

  /**
   * Collects any retrievable amount from the advance's primary payment method
   * And collects from every other primary bank account on file for the user
   *
   * @returns {Promise<Payment[]>}
   */
  private async collectFromAllPaymentOptions(): Promise<{ payments: Payment[]; error?: Error }> {
    const paymentSources = await this.getAllPaymentSources();

    const collectedPayments: Payment[] = [];
    let outsideACHWindow = false;

    await this.advance.reload();

    while (this.advance.outstanding > 0 && paymentSources.length > 0) {
      const { bankAccount, debitCard } = paymentSources.shift();
      const isBackupAccount = bankAccount.id !== this.advance.bankAccountId;
      const accountType = isBackupAccount ? 'backup' : 'primary';
      const collectionType = 'scheduled';

      const balances = await this.getBalances(bankAccount);
      const retrievalAmount = getRetrievalAmount(this.advance, balances, {
        retrieveFullOutstanding: this.retrieveFullOutstanding,
      });

      if (!retrievalAmount) {
        dogstatsd.increment('advance_collection.balance_below_threshold', {
          account_type: accountType,
          collection_type: collectionType,
        });
        this.logResult(false, CollectionFailures.BalanceTooLow, { bankAccountId: bankAccount.id });
      } else {
        const charge = await createFallbackFromDebitCardToBankAccount(
          this.advance,
          bankAccount,
          debitCard,
        );

        const collectionAttempt = await collectAdvance(
          this.advance,
          retrievalAmount,
          charge,
          AdvanceCollectionTrigger.DAILY_CRONJOB,
          this.time,
        );

        if (collectionAttempt.successful()) {
          const payment = await collectionAttempt.getPayment();

          dogstatsd.increment('advance_collection.collection_amount', payment.amount, {
            processor: payment.externalProcessor,
            account_type: isBackupAccount ? 'backup' : 'primary',
          });

          dogstatsd.increment('advance_collection.successful_collection_attempt', {
            processor: payment.externalProcessor,
            account_type: accountType,
          });

          collectedPayments.push(payment);
        } else if (
          collectionAttempt.extra.err.message === CollectionFailures.TimeOutsideACHCollection
        ) {
          this.logResult(false, CollectionFailures.TimeOutsideACHCollection, {
            bankAccountId: bankAccount.id,
          });
          dogstatsd.increment('advance_collection.outside_ach_window');
          outsideACHWindow = true;
        } else {
          logger.error('Advance Collection: Error creating payment', {
            account_type: accountType,
            collection_type: collectionType,
            user_id: this.advance.userId,
            advance: {
              id: this.advance.id,
              bank_account_id: this.advance.bankAccountId,
            },
            collection_attempt: {
              payment_id: collectionAttempt.paymentId,
              extra: collectionAttempt.extra,
            },
          });
          dogstatsd.increment('advance_collection.error_creating_payment', {
            account_type: accountType,
            collection_type: collectionType,
          });
          this.logResult(false, collectionAttempt.extra.err.message, {
            error: collectionAttempt.extra.err,
          });
        }

        await this.advance.reload();
      }

      // Keep collecting if there is more due and there are more payment options
    }

    if (collectedPayments.length === 0 && !outsideACHWindow) {
      const error = new Error('Failed to collect any payments from all primary payment methods.');
      return { payments: collectedPayments, error };
    }

    if (this.advance.outstanding > 0 && outsideACHWindow) {
      await createACHCollectionTask(
        { advanceIds: [this.advance.id] },
        { startTime: getNextACHCollectionTime() },
      );
    }

    return { payments: collectedPayments };
  }

  /**
   * Handles logging tasks' success/failure
   *
   * @param {boolean} isSuccess
   * @param {string} message
   * @param extra
   * @returns {Promise<AuditLog>}
   */
  private async logResult(isSuccess: boolean, message: string, extra: any): Promise<AuditLog> {
    const result = isSuccess ? 'successful' : 'failed';

    dogstatsd.increment('advance_collection.task_finished', {
      result,
    });

    logger.info('Advance Collection: Task Finished', {
      result,
      user_id: this.advance.userId,
      type: this.logName,
      message,
      successful: isSuccess,
      advance_id: this.advance.id,
    });

    return AuditLog.create({
      userId: this.advance.userId,
      type: this.logName,
      message,
      successful: isSuccess,
      eventUuid: this.advance.id,
      extra,
    });
  }
}

export default RefreshBalanceAndCollect;
