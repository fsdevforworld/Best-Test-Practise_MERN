import { Op } from 'sequelize';

import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { PaymentError } from '../../../lib/error';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { withAssociationCounts } from '../../../lib/sequelize-helpers';

import * as Collection from '../../../domain/collection';
import { AdvanceCollectionTrigger, ExternalPaymentCreator } from '../../../typings';

import UserHelper from '../../../helper/user';
import {
  Advance,
  AdvanceCollectionAttempt,
  AdvanceCollectionSchedule,
  AuditLog,
  BankAccount,
  Payment,
} from '../../../models';
import { BankingDataSource } from '@dave-inc/wire-typings';
import logger from '../../../lib/logger';
import { parseLoomisGetPaymentMethod } from '../../../services/loomis-api/helper';

const COLLECTION_STRATEGY = 'debit-fallback-ach';

// For scheduled jobs
const MIN_ADVANCE_AMOUNT = 25;
const MIN_DATE_SCHEDULED = moment().subtract(2, 'weeks');
const MAX_DATE_SCHEDULED = moment().add(1, 'months');

export const MAX_JOB_AGE_MINS = 30;

export async function collect(
  advance: Advance,
  amount: number,
  bankAccountId: number,
  {
    trigger = AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE,
    charge,
  }: { trigger?: AdvanceCollectionTrigger; charge?: ExternalPaymentCreator } = {},
) {
  const bankAccount = await BankAccount.findByPk(bankAccountId);
  const isBackupBankAccount = advance.bankAccountId !== bankAccountId;
  let paymentMethod: PaymentMethod;

  // If we are using a backup bank account we should try the payment method tied to this account
  if (isBackupBankAccount) {
    const loomisResponse = await loomisClient.getPaymentMethod({
      id: bankAccount.defaultPaymentMethodId,
    });
    paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);
  } else {
    const loomisResponse = await loomisClient.getPaymentMethod({ id: advance.paymentMethodId });
    paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);
  }

  if (!charge) {
    charge = await Collection.createFallbackFromDebitCardToBankAccount(
      advance,
      bankAccount,
      paymentMethod,
    );
  }

  const attempt = await Collection.collectAdvance(advance, amount, charge, trigger);

  if (!attempt.successful()) {
    throw attempt.extra.err;
  }

  return attempt.getPayment();
}

export async function handleSuccess(
  payment: Payment,
  advance: Advance,
  bankAccountId: number,
  balances: object,
  jobName: string,
): Promise<AuditLog> {
  dogstatsd.increment('advance_collection.collect_after_bank_account_update', {
    strategy: COLLECTION_STRATEGY,
    accountType: bankAccountId === advance.bankAccountId ? 'primary' : 'backup',
    trigger: jobName,
    status: 'success',
  });
  return AuditLog.create({
    userId: payment.userId,
    type: jobName,
    message: `Created ${payment.amount} payment`,
    successful: true,
    eventUuid: payment.advanceId,
    extra: {
      balances,
      payment,
    },
  });
}

export async function handleTaskSuccess(
  taskId: string,
  advance: Advance,
  balances: object,
  jobName: string,
): Promise<AuditLog> {
  dogstatsd.increment('advance_collection.collect_after_bank_account_update.deferred_to_tivan', {
    trigger: jobName,
    status: 'success',
  });
  return AuditLog.create({
    userId: advance.userId,
    type: jobName,
    message: `Enqueued Tivan payment task`,
    successful: true,
    eventUuid: advance.id,
    extra: {
      balances,
      taskId,
    },
  });
}

export async function handleFailure(
  err: Error,
  bankAccountId: number,
  userId: number,
  jobName: string,
  advance?: Advance,
): Promise<AuditLog> {
  if (!advance) {
    logger.error('No advance created in collect after update', { err });
  }
  dogstatsd.increment('advance_collection.collect_after_bank_account_update', {
    strategy: COLLECTION_STRATEGY,
    accountType: advance
      ? bankAccountId === advance.bankAccountId
        ? 'primary'
        : 'backup'
      : undefined,
    trigger: jobName,
    status: 'failure',
  });
  return AuditLog.create({
    userId,
    type: jobName,
    message: err.message,
    successful: false,
    eventUuid: advance ? advance.id : null,
    extra: { err },
  });
}

function isBackupAccount(bankAccountIdToCollect: number, advanceBankAccount: BankAccount): boolean {
  return bankAccountIdToCollect !== advanceBankAccount.id;
}

function canCollectFromBackupBankAccount(
  bankAccountIdToCollect: number,
  advanceBankAccount: BankAccount,
): boolean {
  if (advanceBankAccount.bankConnection.bankingDataSource === BankingDataSource.BankOfDave) {
    return false;
  }

  return true;
}

export async function shouldSkipTivan(advance: Advance): Promise<boolean> {
  const useTivan = false;

  if (useTivan) {
    dogstatsd.increment('advance_collection.deferred_to_tivan');

    return false;
  }

  return true;
}
export async function getCollectibleAdvances(
  userId: number,
  bankAccountId: number,
): Promise<Advance[]> {
  const primaryBankAccounts = await UserHelper.getAllPrimaryBankAccounts(userId, {
    paranoid: false,
  });

  const bankAccountIdsToCollect = [
    // Collectible advances associated with the updated bank account
    bankAccountId,
    // Collectible advances associated with any other primary bank accounts
    ...primaryBankAccounts
      .filter(bankAccount => isBackupAccount(bankAccountId, bankAccount))
      .filter(bankAccount => canCollectFromBackupBankAccount(bankAccountId, bankAccount))
      .map(ba => ba.id),
  ];

  return withAssociationCounts<Advance>(
    Advance.scope('collectibleAdvance'),
    [
      {
        name: 'activeCollectionAttempts',
        model: AdvanceCollectionAttempt.scope('active'),
        having: { [Op.lt]: 1 },
      },
      {
        name: 'successfulCollections',
        model: AdvanceCollectionAttempt.scope('successful'),
        having: { [Op.lt]: Collection.MAX_COLLECTION_ATTEMPTS },
      },
    ],
    {
      where: {
        paybackDate: { [Op.lte]: moment().tz(DEFAULT_TIMEZONE) },
        bankAccountId: bankAccountIdsToCollect,
      },
    },
  );
}

export async function getCollectibleAdvancesScheduled(
  userId: number,
  bankAccountId: number,
): Promise<Advance[]> {
  const primaryBankAccounts = await UserHelper.getAllPrimaryBankAccounts(userId, {
    paranoid: false,
  });

  const bankAccountIdsToCollect = [
    // Collectible advances associated with the updated bank account
    bankAccountId,
    // Collectible advances associated with any other primary bank accounts
    ...primaryBankAccounts
      .filter(bankAccount => canCollectFromBackupBankAccount(bankAccountId, bankAccount))
      .map(ba => ba.id),
  ];

  return withAssociationCounts<Advance>(
    Advance.scope('collectibleAdvance'),
    [
      {
        name: 'activeCollectionAttempts',
        model: AdvanceCollectionAttempt.scope('active'),
        having: { [Op.lt]: 1 },
      },
      {
        name: 'successfulCollections',
        model: AdvanceCollectionAttempt.scope('successful'),
        having: { [Op.lt]: Collection.MAX_COLLECTION_ATTEMPTS },
      },
      {
        name: 'scheduledAdvanceCollections',
        model: AdvanceCollectionSchedule,
        required: true,
        where: {
          [Op.and]: {
            windowStart: {
              [Op.lte]: moment()
                .tz(DEFAULT_TIMEZONE)
                .format('YYYY-MM-DD'),
            },
            windowEnd: {
              [Op.gte]: moment()
                .tz(DEFAULT_TIMEZONE)
                .format('YYYY-MM-DD'),
            },
          },
        },
        having: { [Op.gte]: 1 },
      },
    ],
    {
      where: {
        bankAccountId: bankAccountIdsToCollect,
        paybackDate: {
          [Op.between]: [
            MIN_DATE_SCHEDULED.tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD'),
            MAX_DATE_SCHEDULED.tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD'),
          ],
        },
        amount: { [Op.gte]: MIN_ADVANCE_AMOUNT },
      },
    },
  );
}

export async function shouldAttemptCollection(
  bankAccount: BankAccount,
  updatedAt: string,
): Promise<boolean> {
  // Check if stale
  if (updatedAt) {
    const isBalanceStale = moment(updatedAt) < moment().subtract(MAX_JOB_AGE_MINS, 'minutes');
    if (isBalanceStale) {
      dogstatsd.increment('collect_after_bank_account_update.job_data_expired');
      throw new PaymentError('Recent account update message expired');
    }
  } else if (
    bankAccount &&
    moment().diff(bankAccount.bankConnection.lastPull, 'minutes') > MAX_JOB_AGE_MINS
  ) {
    dogstatsd.increment('collect_after_bank_update.time_window_elapsed');
    return false;
  }

  return bankAccount.isSupported() && (await bankAccount.isPrimaryAccount());
}
