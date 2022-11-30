import ErrorHelper from '@dave-inc/error-helper';
import { moment } from '@dave-inc/time-lib';
import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { isEmpty, isEqual, isNil, keyBy, map, max, min, omit, uniq } from 'lodash';
import { Moment } from 'moment';
import { Op } from 'sequelize';
import { dogstatsd } from '../../lib/datadog-statsd';
import { BankDataSyncError } from '../../lib/error';
import logger from '../../lib/logger';
import { scrubTransactionName } from '../../lib/utils';
import { BankAccount, BankConnection, BankTransaction } from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import {
  getMerchantInfoForBankTransaction,
  MerchantInfoBankTransactionFields,
} from '../../services/heath/domain';
import { BankingDataSyncSource, BankTransactionResponse } from '../../typings';
import { generateBankingDataSource } from '../banking-data-source';
import * as RecurringTransactionJobs from '../recurring-transaction/jobs';

async function processTransactionChanges(
  bankAccounts: BankAccount[],
  existingTransactions: BankTransaction[],
  incomingTransactions: BankTransactionResponse[],
) {
  const transactionPairs = matchTransactionsToPayloadData(
    existingTransactions,
    incomingTransactions,
  );
  const bankAccountProps = getPropsFromBankAccounts(bankAccounts);
  const { updates, deletes, creates } = serializeTransactionData(
    transactionPairs,
    bankAccountProps,
  );
  await addMerchantInfo(updates.concat(creates));

  await Promise.all([
    checkedBulkInsert(creates),
    BankTransaction.destroy({
      where: { id: deletes.map(d => d.id) },
    }),
  ]);

  await Bluebird.each(updates, async transaction => {
    try {
      await BankTransaction.update(transaction, { where: { id: transaction.id } });
    } catch (error) {
      logger.error('Error updating bank transactions', { error });
      dogstatsd.increment('sync_bank_transactions.update.error');
    }
  });
}

/** Dave banking transactions are sent in one by one by a consumer when received from
 * Galileo's webhook and when sent in batches only done by account.
 */
export async function syncDaveBankingTransactions(
  bankAccount: BankAccount,
  transactions: BankTransactionResponse[],
) {
  const nonCanceledOrReturnedTransactions = transactions.filter(x => !x.cancelled && !x.returned);

  const existingTransactions = await BankTransaction.findAll({
    where: {
      bankAccountId: bankAccount.id,
      externalId: { [Op.in]: transactions.map(x => x.externalId) },
    },
  });

  await processTransactionChanges(
    [bankAccount],
    existingTransactions,
    nonCanceledOrReturnedTransactions,
  );

  const startDate = min(transactions.map(t => t.transactionDate)).format('YYYY-MM-DD');
  const endDate = max(transactions.map(t => t.transactionDate)).format('YYYY-MM-DD');

  await logUpsertsAndQueueExpectedTransactionTask({
    bankConnection: bankAccount.bankConnection,
    startDate,
    endDate,
    incomingTransactions: transactions,
    initialPull: false,
    historical: false,
    source: BankingDataSyncSource.BankOfDaveTransactionsConsumer,
  });
}

export async function syncBankTransactions({
  startDate,
  endDate,
  data,
}: {
  data: BankTransactionResponse[];
  startDate: string;
  endDate: string;
}) {
  const bankAccounts = await BankAccount.findAll({
    where: {
      externalId: { [Op.in]: uniq(map(data, 'bankAccountExternalId')) },
    },
    paranoid: false,
  });

  const existingTransactions = await BankTransaction.findAll({
    where: {
      bankAccountId: bankAccounts.map(b => b.id),
      transactionDate: {
        [Op.between]: [startDate, endDate],
      },
    },
  });

  await processTransactionChanges(bankAccounts, existingTransactions, data);
}

function addMerchantInfo(transactions: MerchantInfoBankTransactionFields[]) {
  return Bluebird.map(transactions, async transaction => {
    if (!transaction.merchantInfoId) {
      const merchantInfo = await getMerchantInfoForBankTransaction(transaction);
      transaction.merchantInfoId = merchantInfo.id;
    }

    return transaction;
  });
}

async function checkedBulkInsert(creates: BankTransactionCreate[]): Promise<void> {
  try {
    await BankTransaction.bulkInsertAndRetry(creates);
  } catch (error) {
    logger.error('Error doing transaction bulk insert', ErrorHelper.logFormat(error));
    throw error;
  }
}

function serializeTransactionData(
  transactionPairs: BankTransactionPayloadPair[],
  bankAccountProps: { [externalId: string]: BankAccountProps },
) {
  const operations: {
    updates: BankTransactionCreate[];
    deletes: Array<{
      id?: number;
      bankTransactionUuid?: string;
      bankAccountId: number;
      externalId: string;
    }>;
    creates: BankTransactionCreate[];
  } = {
    updates: [],
    deletes: [],
    creates: [],
  };

  return transactionPairs.reduce((ops, pair: BankTransactionPayloadPair) => {
    const { transaction, payload } = pair;

    if (transaction && payload && transactionNeedsUpdate(pair)) {
      ops.updates.push(formatUpdate(pair, bankAccountProps));
    } else if (transaction && !payload) {
      ops.deletes.push(formatDelete(pair));
    } else if (payload && !transaction) {
      ops.creates.push(formatCreate(pair, bankAccountProps));
    }

    return ops;
  }, operations);
}

function transactionNeedsUpdate({ payload, transaction }: BankTransactionPayloadPair) {
  let needsUpdate = false;
  const fields: Array<keyof BankTransactionResponse & keyof BankTransaction> = [
    'externalId',
    'amount',
    'pending',
    'externalName',
    'address',
    'city',
    'state',
    'zipCode',
    'plaidCategoryId',
    'referenceNumber',
    'ppdId',
    'payeeName',
  ];

  if (!moment(payload.transactionDate).isSame(transaction.transactionDate)) {
    dogstatsd.increment('bank_transaction.update.changed_field', { field: 'transactionDate' });
    needsUpdate = true;
  }

  if (!isEqual(payload.plaidCategory, transaction.plaidCategory)) {
    dogstatsd.increment('bank_transaction.update.changed_field', { field: 'plaidCategory' });
    needsUpdate = true;
  }

  for (const field of fields) {
    const bothNil = isNil(payload[field]) && isNil(transaction[field]);
    if (payload[field] !== transaction[field] && !bothNil) {
      dogstatsd.increment('bank_transaction.update.changed_field', { field });
      needsUpdate = true;
    }
  }

  return needsUpdate;
}

function matchTransactionsToPayloadData(
  transactions: BankTransaction[],
  transactionPayloads: BankTransactionResponse[],
): BankTransactionPayloadPair[] {
  const transactionByExternalId = keyBy(transactions, 'externalId');

  const matchedPayloads = transactionPayloads.map(payload => {
    const { pendingExternalId, externalId } = payload;
    let matchedTransaction = transactionByExternalId[externalId];
    if (!matchedTransaction && pendingExternalId) {
      matchedTransaction = transactionByExternalId[pendingExternalId];
    }
    if (matchedTransaction) {
      delete transactionByExternalId[matchedTransaction.externalId];
    }

    return { transaction: matchedTransaction, payload };
  });

  Object.values(transactionByExternalId).forEach(unmatchedTransaction => {
    matchedPayloads.push({ transaction: unmatchedTransaction, payload: null });
  });

  return matchedPayloads;
}

function formatCreate(
  { payload }: BankTransactionPayloadPair,
  bankAccountFieldsMap: { [externalId: string]: BankAccountProps },
): BankTransactionCreate {
  const bankAccountFields = bankAccountFieldsMap[payload.bankAccountExternalId];
  if (!bankAccountFields) {
    throw new BankDataSyncError(`Bank account not found with id: ${payload.bankAccountExternalId}`);
  }
  return {
    ...omit(payload, ['bankAccountExternalId', 'pendingExternalId']),
    ...bankAccountFields,
    displayName: scrubTransactionName(payload.externalName),
    transactionDate: moment(payload.transactionDate),
    pendingExternalName: payload.pending ? payload.externalName : undefined,
    pendingDisplayName: payload.pending ? scrubTransactionName(payload.externalName) : undefined,
  };
}

function formatUpdate(
  { transaction, payload }: BankTransactionPayloadPair,
  bankAccountFieldsMap: { [externalId: string]: BankAccountProps },
): BankTransactionCreate {
  return {
    ...formatCreate({ transaction: null, payload }, bankAccountFieldsMap),
    id: transaction.id,
    pendingDisplayName: transaction.pendingDisplayName,
    pendingExternalName: transaction.pendingExternalName,
    merchantInfoId: transaction.merchantInfoId,
    created: transaction.created,
  };
}

function formatDelete({ transaction }: BankTransactionPayloadPair) {
  return transaction.serialize();
}

function getPropsFromBankAccounts(bankAccounts: BankAccount[]) {
  const propsMap: {
    [externalId: string]: {
      bankAccountId: number;
      userId: number;
      accountType: BankAccountType;
      accountSubtype: BankAccountSubtype;
    };
  } = {};

  return bankAccounts.reduce((propMap, bankAccount) => {
    const { id, userId, type, subtype, externalId } = bankAccount;

    propMap[externalId] = {
      bankAccountId: id,
      userId,
      accountType: type,
      accountSubtype: subtype,
    };

    return propMap;
  }, propsMap);
}

export async function fetchAndSyncBankTransactions(
  connection: BankConnection,
  {
    historical,
    startDate,
    endDate,
    source,
    initialPull,
    removed,
    accountIds,
    expectedTransactionIds,
  }: {
    historical?: boolean;
    startDate?: string;
    endDate?: string;
    source?: BankingDataSyncSource;
    initialPull?: boolean;
    removed?: string[];
    accountIds?: number[];
    expectedTransactionIds?: string[];
  } = {},
): Promise<void> {
  if (!startDate) {
    startDate = await getStartDate({
      removed,
      lastPull: connection.lastPull,
      accountIds,
      endDate,
      initialPull,
      historical,
    });
  }

  if (!endDate) {
    endDate = moment()
      .add(2, 'day')
      .format('YYYY-MM-DD');
  }

  const transactions = await fetchTransactions(connection, startDate, endDate);
  if (!!expectedTransactionIds) {
    const retrievedIds = transactions.map(t => t.externalId);
    const missingIds = expectedTransactionIds.filter(tid => !retrievedIds.includes(tid));
    if (!isEmpty(missingIds)) {
      logger.warn('Did not get expected transaction ID when retrieving from source', {
        missingIds,
      });
    }
  }

  await syncBankTransactions({ data: transactions, startDate, endDate });
  await logUpsertsAndQueueExpectedTransactionTask({
    bankConnection: connection,
    startDate,
    endDate,
    incomingTransactions: transactions,
    initialPull,
    historical,
    source,
  });
}

async function logUpsertsAndQueueExpectedTransactionTask({
  bankConnection,
  incomingTransactions,
  startDate,
  endDate,
  source,
  initialPull,
  historical,
}: {
  bankConnection: BankConnection;
  incomingTransactions: BankTransactionResponse[];
  startDate: string;
  endDate: string;
  source: BankingDataSyncSource;
  initialPull: boolean;
  historical: boolean;
}) {
  await logTransactionUpsert(bankConnection, incomingTransactions, {
    source,
    initialPull,
    startDate,
    endDate,
  });

  const initialOrHistoricalUpdate = initialPull || historical;
  const canUseReadReplica =
    !initialOrHistoricalUpdate && source !== BankingDataSyncSource.UserRefresh;

  await RecurringTransactionJobs.createUpdateExpectedTransactionsTask({
    bankConnectionId: bankConnection.id,
    source,
    canUseReadReplica,
  });
}

async function getStartDate({
  removed,
  lastPull,
  accountIds,
  initialPull,
  historical,
  endDate,
}: {
  removed: string[];
  lastPull: string | Moment;
  accountIds: number[];
  initialPull: boolean;
  historical: boolean;
  endDate: string;
}) {
  // We need to go back to the first deleted and sync transactions from there
  let startDate: string;
  if (removed?.length > 0 && accountIds) {
    startDate = (
      await BankTransaction.unscoped().min<BankTransaction, Moment>('transactionDate', {
        where: {
          externalId: removed,
          bankAccountId: accountIds,
        },
      })
    ).format('YYYY-MM-DD');
  } else if (initialPull) {
    startDate = moment()
      .subtract(70, 'days')
      .format('YYYY-MM-DD');
  } else if (historical && !startDate) {
    // TODO up to 18 months once database fires subside
    startDate = moment(endDate)
      .subtract(6, 'month')
      .format('YYYY-MM-DD');
  } else if (lastPull && !startDate) {
    startDate = moment(lastPull)
      .subtract(7, 'days')
      .format('YYYY-MM-DD');
  } else if (!startDate) {
    startDate = moment()
      .subtract(30, 'days')
      .format('YYYY-MM-DD');
  }

  return startDate;
}

export async function fetchTransactions(
  connection: BankConnection,
  startDate: string,
  endDate: string,
): Promise<BankTransactionResponse[]> {
  // TODO at some point we should save all bank accounts for a user and then we don't need to filter
  // by saved bank accounts
  const accounts = await connection.getBankAccounts();
  const accountIds = accounts.map(acc => acc.externalId);
  const bankingDataSource = await generateBankingDataSource(connection);

  return bankingDataSource.getTransactions(startDate, endDate, accountIds, {
    perPage: 500,
    pageNumber: 0,
  });
}

async function logTransactionUpsert(
  connection: BankConnection,
  transactions: BankTransactionResponse[],
  extra: {
    source?: BankingDataSyncSource;
    initialPull?: boolean;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  if (transactions.length > 0) {
    const dates = transactions.map(txn => txn.transactionDate);
    const oldestTransactionDate = min(dates).format('YYYY-MM-DD');
    await BankConnectionUpdate.create({
      userId: connection.userId,
      bankConnectionId: connection.id,
      type: `${connection.bankingDataSource}_UPDATE_TRANSACTIONS`,
      successful: true,
      extra: {
        totalTransactions: transactions.length,
        oldestTransactionDate,
        ...extra,
      },
    });
  } else {
    await BankConnectionUpdate.create({
      userId: connection.userId,
      bankConnectionId: connection.id,
      type: `${connection.bankingDataSource}_UPDATE_TRANSACTIONS_NOT_FOUND`,
      successful: true,
      extra: {
        ...extra,
      },
    });
  }
}

type BankAccountProps = {
  bankAccountId: number;
  userId: number;
  accountType: BankAccountType;
  accountSubtype: BankAccountSubtype;
};

type BankTransactionCreate = {
  id?: number;
  bankAccountId: number;
  userId: number;
  accountType: BankAccountType;
  accountSubtype: BankAccountSubtype;
  plaidCategory?: string[];
  amount: number;
  pendingDisplayName?: string;
  pendingExternalName?: string;
  externalName: string;
  displayName: string;
  transactionDate: Moment;
  merchantInfoId?: number;
  created?: Date;
};

type BankTransactionPayloadPair = {
  transaction: Partial<BankTransaction>;
  payload: BankTransactionResponse | null;
};
