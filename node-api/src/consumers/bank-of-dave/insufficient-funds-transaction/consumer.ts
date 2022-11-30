import { moment } from '@dave-inc/time-lib';
import { DaveBankingPubSubAccount, DaveBankingPubSubTransaction } from '@dave-inc/wire-typings';
import { Message } from '@google-cloud/pubsub';
import { get } from 'lodash';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import * as Notifications from '../../../domain/notifications';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { NotFoundError } from '../../../lib/error';
import logger from '../../../lib/logger';
import { setNxEx } from '../../../lib/redis';
import {
  AuditLog,
  BankAccount,
  BankConnection,
  Notification,
  User,
  UserNotification,
} from '../../../models';
import { NotificationType } from '../../../models/notification';
import { AnalyticsEvent, BankingDataSyncSource } from '../../../typings';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';
import { AdvanceApprovalTrigger } from '../../../services/advance-approval/types';
import { getTimezone } from '../../../domain/user-setting';
import { getAdvanceSummary } from '../../../domain/advance-approval-request';

type Data = {
  account: DaveBankingPubSubAccount;
  transaction: DaveBankingPubSubTransaction;
};

export enum DogstatsdMessages {
  BankAccountNotFound = 'consume_dave_banking_insufficient_funds_transaction.bank_account_not_found',
  HandleMessageError = 'consume_dave_banking_insufficient_funds_transaction.handle_message_error',
  HandleMessageSuccess = 'consume_dave_banking_insufficient_funds_transaction.handle_message_success',
  AdvanceNotApproved = 'consume_dave_banking_insufficient_funds_transaction.advance_not_approved',
  AdvanceApproved = 'consume_dave_banking_insufficient_funds_transaction.advance_approved',
  DuplicateTransactionReceived = 'consume_dave_banking_insufficient_funds_transaction.duplicate_transaction_received',
}

export async function handleMessage(message: Message, data: Data) {
  const { account, transaction } = data;

  try {
    logger.info('Received message from insufficient-funds-transaction consumer', {
      account,
      publishTime: message.publishTime.toISOString(),
      transaction,
    });

    await consumeInsufficientFundsTransaction(account, transaction);

    dogstatsd.increment(DogstatsdMessages.HandleMessageSuccess);
  } catch (error) {
    logger.error('Error from insufficient-funds-transaction consumer', {
      accountUuid: account.uuid,
      message: `Error from insufficient-funds-transaction consumer`,
      error,
    });

    dogstatsd.increment(DogstatsdMessages.HandleMessageError, 1, {
      message: error.message,
    });
  }

  message.ack();
}

async function consumeInsufficientFundsTransaction(
  account: DaveBankingPubSubAccount,
  transaction: DaveBankingPubSubTransaction,
) {
  const bankAccount = await BankAccount.findOne({
    include: [{ model: BankConnection, include: [User] }],
    where: {
      externalId: account.uuid,
    },
  });
  if (!bankAccount) {
    dogstatsd.increment(DogstatsdMessages.BankAccountNotFound);
    throw new NotFoundError(
      `Could not find DaveBanking bank account with external id: ${account.uuid}`,
    );
  }

  const redisKey = `insufficientFundsTransactionConsumerTransactionUUID:${transaction.uuid}`;
  const isFirstAppearance = await setNxEx(redisKey, 3600, '1');
  if (!isFirstAppearance) {
    dogstatsd.increment(DogstatsdMessages.DuplicateTransactionReceived);
    return;
  }

  const { bankConnection } = bankAccount;
  const { user } = bankConnection;

  const logData = {
    accountUUID: account.uuid,
    transactionAmount: transaction.amount,
    transactionUUID: transaction.uuid,
  };

  // Make sure bank account balance and transactions are latest before
  // advance approval.
  // TODO: Update me and use syncDaveBankingTransactions once we verify its working in production
  await BankingDataSync.fetchAndSyncBankTransactions(bankConnection, {
    source: BankingDataSyncSource.InsufficientFundsTransactionConsumer,
    startDate: moment(transaction.transactedAt)
      .subtract(2, 'day') // Arbitrary buffer to make sure transaction is pulled.
      .format('YYYY-MM-DD'),
  });

  await bankAccount.reload();

  const [approvalResponse] = await AdvanceApprovalClient.createAdvanceApproval({
    userTimezone: await getTimezone(user.id),
    userId: user.id,
    bankAccountId: bankAccount.id,
    advanceSummary: await getAdvanceSummary(user.id),
    trigger: AdvanceApprovalTrigger.BodInsufficientFundsTransaction,
    logData,
  });

  const userNotification = await UserNotification.findOne({
    include: [
      {
        model: Notification,
        where: { type: NotificationType.AUTO_ADVANCE_APPROVAL },
      },
    ],
    where: { userId: user.id },
  });

  const pushEnabled = get(userNotification, 'pushEnabled');
  const smsEnabled = get(userNotification, 'smsEnabled');

  let analyticsEventProperties = {
    accountBalance: bankAccount.current,
    advanceApprovedAmount: 0,
    advanceApproved: false,
    advanceEnablesPurchase: false,
    pushEnabled,
    smsEnabled,
    transactionAmount: transaction.amount,
    transactionMerchantName: transaction.source.name,
  };

  let auditLog: PromiseLike<AuditLog>;

  if (approvalResponse.approved) {
    const maxApprovedAmount = Math.max(...approvalResponse.approvedAmounts);

    const balanceAfterAdvance = bankAccount.current + maxApprovedAmount;
    const balanceAfterPurchase = balanceAfterAdvance - transaction.amount;
    const advanceEnablesPurchase = balanceAfterPurchase >= 0;

    analyticsEventProperties = {
      ...analyticsEventProperties,
      advanceApproved: true,
      advanceApprovedAmount: maxApprovedAmount,
      advanceEnablesPurchase,
    };

    auditLog = AuditLog.create({
      userId: user.id,
      type: 'BOD_INSUFFICIENT_FUNDS_ADVANCE_APPROVED',
      message: `Pre-approved for advance and ${AnalyticsEvent.DebitCardWithInsufficientFundsDenied} event sent.`,
      successful: true,
      extra: {
        ...logData,
        accountBalance: bankAccount.current,
        approvalResponse,
        maxApprovedAmount,
        transactionAmount: transaction.amount,
      },
    });

    dogstatsd.increment(DogstatsdMessages.AdvanceApproved, [
      `enables_purchase:${advanceEnablesPurchase}`,
    ]);
  } else {
    dogstatsd.increment(DogstatsdMessages.AdvanceNotApproved);
  }

  logger.info('BOD debit card user denied with insufficient funds', {
    ...logData,
    analyticsEventProperties,
    bankAccountId: bankAccount.id,
    userId: user.id,
  });

  const marketingEvents = Notifications.createMarketingEventsForUser(
    user.id.toString(),
    AnalyticsEvent.DebitCardWithInsufficientFundsDenied,
    analyticsEventProperties,
    moment(transaction.transactedAt),
  );

  await Promise.all([auditLog, marketingEvents]);
}
