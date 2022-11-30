import { AuditLog, BankAccount, BankConnection, User } from '../../models';
import * as Rewards from '../rewards';
import SynapsepayNodeLib from '../synapsepay/node';
import { dogstatsd } from '../../lib/datadog-statsd';
import { sampleSize, uniq } from 'lodash';
import { BankTransactionResponse } from '../../typings';
import { copyBankAccountData } from './copy-bank-account';
import HeathClient from '../../lib/heath-client';
import logger from '../../lib/logger';
import ErrorHelper from '@dave-inc/error-helper';
import { generateBankingDataSource } from '../banking-data-source';
import { moment } from '@dave-inc/time-lib';
import { BankTransaction } from '@dave-inc/heath-client';

export async function deleteBankAccount(bankAccount: BankAccount, user: User) {
  await removeRelationships(bankAccount, user);
  await bankAccount.destroy();
}

async function matchByRandomBankTransaction(
  bankAccount: BankAccount,
  accounts: BankAccount[],
  connection: BankConnection,
) {
  const transactions = await HeathClient.getBankTransactions(bankAccount.id, {}, { limit: 20 });

  if (transactions.length === 0) {
    dogstatsd.increment('bank_account.match_by_random.no_random_transactions');
    return null;
  }

  const randomSample = sampleSize(transactions, 3);

  const matches = await matchBankTransactions(randomSample, accounts, connection);

  if (matches.length) {
    const matchingAccountIds = uniq(matches.map(m => m.bankAccountExternalId));
    if (matchingAccountIds.length > 1) {
      dogstatsd.increment('bank_account.match_by_random.more_than_1_matching');
    } else {
      dogstatsd.increment('bank_account.match_by_random.found_matching_account', 1, {
        numMatches: matches.length.toString(),
      });
      return accounts.find(a => a.externalId === matchingAccountIds[0]);
    }
  } else {
    dogstatsd.increment('bank_account.match_by_random.no_match_found');
  }

  return null;
}

async function matchBankTransactions(
  transactions: BankTransaction[],
  accounts: BankAccount[],
  connection: BankConnection,
): Promise<BankTransactionResponse[]> {
  const source = await generateBankingDataSource(connection);
  transactions = transactions.sort((a, b) => moment(b.transactionDate).diff(a.transactionDate));
  const sourceTransactions = await source.getTransactions(
    transactions[transactions.length - 1].transactionDate,
    transactions[0].transactionDate,
    accounts.map(a => a.externalId),
    {
      perPage: 500,
      pageNumber: 0,
    },
  );

  return sourceTransactions.filter(transaction => {
    return transactions.some(t => {
      return (
        moment(t.transactionDate).isSame(transaction.transactionDate, 'day') &&
        t.amount === transaction.amount &&
        t.externalName === transaction.externalName
      );
    });
  });
}

export async function handleRemovedDefaultAccount(
  defaultAccount: BankAccount,
  accounts: BankAccount[],
  connection: BankConnection,
) {
  const nameMatch = accounts.find(
    account =>
      defaultAccount.displayName === account.displayName &&
      defaultAccount.lastFour === account.lastFour,
  );

  const randomMatch = await matchByRandomBankTransaction(defaultAccount, accounts, connection);
  if (nameMatch || randomMatch) {
    let matchType = 'all';
    if (!randomMatch) {
      matchType = 'name_match';
    } else {
      matchType = 'random_match';
    }
    await AuditLog.create({
      userId: connection.userId,
      type: 'EXTERNAL_ID_UPDATE',
      successful: true,
      eventUuid: connection.id,
      extra: {
        matchType,
        nameMatchAccountId: nameMatch && nameMatch.id,
        oldBankAccount: defaultAccount,
        randomTransactionMatchAccountId: randomMatch && randomMatch.id,
      },
    });
    dogstatsd.increment('bank_account.handle_external_id_change.updated_default_external_id', 1, {
      matchType,
    });
    const newDefaultAccount = randomMatch || nameMatch;
    await copyBankAccountData(defaultAccount, newDefaultAccount, connection);
  } else {
    await AuditLog.create({
      userId: connection.userId,
      type: 'DEFAULT_ACCOUNT_REMOVED_FROM_PLAID',
      successful: false,
      eventUuid: connection.id,
      extra: {
        removedAccount: defaultAccount,
      },
    });

    const user = await defaultAccount.getUser();
    await deleteBankAccount(defaultAccount, user);
    dogstatsd.increment('bank_account.handle_external_id_change.removed_default_account');
  }
}

export async function removeRelationships(bankAccount: BankAccount, user: User) {
  // Check if user is linked to a rewards program and sever connection if so
  const paymentMethods = await bankAccount.getPaymentMethods();
  const empyrPaymentMethod = paymentMethods.find(pm => pm.empyrCardId != null);
  if (empyrPaymentMethod) {
    await Rewards.deleteEmpyrCard(user, empyrPaymentMethod.id);
  }

  try {
    if (bankAccount.synapseNodeId) {
      await SynapsepayNodeLib.deleteSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId: null });
    }
  } catch (err) {
    logger.error('Error deleting bank account(s)', { err: ErrorHelper.logFormat(err) });
  }
}
