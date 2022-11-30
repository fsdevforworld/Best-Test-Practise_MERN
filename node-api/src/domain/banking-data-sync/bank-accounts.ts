import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { compact, get } from 'lodash';
import { dogstatsd } from '../../lib/datadog-statsd';
import {
  ConflictError,
  DefaultAccountRemovedError,
  InvalidParametersError,
  NotFoundError,
  UnsupportedBankConnection,
} from '../../lib/error';
import { retry } from '../../lib/utils';
import { BankAccount, BankConnection, sequelize, User } from '../../models';
import { FailureMessageKey, NotFoundMessageKey, UnsupportedErrorKey } from '../../translations';
import { BankAccountResponse } from '../../typings';
import { generateBankingDataSource } from '../banking-data-source';
import * as AccountAndRouting from './account-and-routing';
import { cacheBankAccountBalances } from './balance-cache';
import { getAccountsWithAccountAndRouting } from './bank-connection';
import { getAccountAndRoutingFromOldAccounts } from './copy-bank-account';
import { deleteBankAccount, handleRemovedDefaultAccount } from './delete-bank-account';

export async function handleExternalIdChanges(accounts: BankAccount[], connection: BankConnection) {
  const existingAccounts = await connection.getBankAccounts();
  const user = await connection.getUser();
  const removedAccounts = existingAccounts.filter(
    acc => !accounts.some(newAcc => newAcc.externalId === acc.externalId),
  );

  if (removedAccounts.length === 0) {
    return;
  }

  const nonDefaultRemovedAccounts = removedAccounts.filter(acc => {
    return acc.id !== user.defaultBankAccountId && acc.id !== connection.primaryBankAccountId;
  });

  await Bluebird.mapSeries(nonDefaultRemovedAccounts, async acc => {
    await deleteBankAccount(acc, user);
    dogstatsd.increment('bank_account.handle_external_id_change.removed_non_default_account');
  });

  const userDefaultRemovedAccount = removedAccounts.find(acc => {
    return acc.id === user.defaultBankAccountId;
  });

  const connectionDefaultRemovedAccount = removedAccounts.find(acc => {
    return acc.id === connection.primaryBankAccountId;
  });

  // Handle the case where the user's default account was removed
  if (userDefaultRemovedAccount) {
    await handleRemovedDefaultAccount(userDefaultRemovedAccount, accounts, connection);
  }

  // Handle the case where the bank connection's primary account was removed
  // and is different from the removed user default account
  const isBankConnectionDefaultAccountRemoved =
    connectionDefaultRemovedAccount &&
    connectionDefaultRemovedAccount.id !== get(userDefaultRemovedAccount, 'id');
  if (isBankConnectionDefaultAccountRemoved) {
    await handleRemovedDefaultAccount(connectionDefaultRemovedAccount, accounts, connection);
  }
}

export async function addAccountAndRoutingToAccounts(
  connection: BankConnection,
  accounts: BankAccount[],
): Promise<BankAccount[]> {
  const statsdTags = {
    institution_id: String(connection.institutionId),
    banking_data_source: connection.bankingDataSource,
  };
  dogstatsd.increment('bank_connection.add_account_and_routing_to_accounts.called', statsdTags);
  const matchedOldAccounts = await getAccountAndRoutingFromOldAccounts(accounts);
  if (matchedOldAccounts) {
    dogstatsd.increment(
      'bank_connection.add_account_and_routing_to_accounts.copied_from_old_account',
      statsdTags,
    );
    return matchedOldAccounts;
  }

  const bankingDataSourceAccounts = await getAccountsWithAccountAndRouting(connection);

  if (!bankingDataSourceAccounts) {
    // This happens when this account does not support auth, the above function does not throw an error
    return accounts;
  }

  const { duplicateAccountErrors, validAccounts } = await Bluebird.reduce(
    bankingDataSourceAccounts,
    async (result, acc: BankAccountResponse) => {
      const matchingAccount = accounts.find(account => acc.externalId === account.externalId);
      if (acc.routing && acc.account && matchingAccount) {
        dogstatsd.increment(
          'bank_connection.add_account_and_routing_to_accounts.matching_external_id_found',
          statsdTags,
        );
        const accountAndRouting = { account: acc.account, routing: acc.routing };
        try {
          await AccountAndRouting.addAccountAndRouting(matchingAccount, accountAndRouting);
          result.validAccounts.push(matchingAccount);
        } catch (err) {
          dogstatsd.increment(
            'bank_connection.add_account_and_routing_to_accounts.error_adding_ar',
            {
              error: err.message,
              ...statsdTags,
            },
          );
          // Conflict errors are sometime acceptable so lets catch them
          if (err instanceof ConflictError) {
            result.duplicateAccountErrors.push(err);
            // for now we don't want to store duplicate accounts
            await matchingAccount.destroy();
          } else {
            throw err;
          }
        }
      }

      return result;
    },
    { duplicateAccountErrors: [], validAccounts: [] },
  );

  const hasDuplicateAccountErrors = duplicateAccountErrors.length > 0;
  const hasValidAccounts = validAccounts.length > 0 && hasAdvanceableAccount(validAccounts);

  // if we cannot add any accounts and we have a duplicate account error than throw that error
  if (!hasValidAccounts && hasDuplicateAccountErrors) {
    throw duplicateAccountErrors[0];
  } else if (hasValidAccounts && hasDuplicateAccountErrors) {
    // TODO am curious about how much this is happening we could probably remove this later
    dogstatsd.increment('bank_account.upsert.ignored_duplicate_error', statsdTags);
  }

  return validAccounts;
}

export async function upsertBankAccounts(connection: BankConnection) {
  const bankingDataSource = await generateBankingDataSource(connection);

  const accounts = await retry<BankAccountResponse[]>(() => {
    return bankingDataSource.getAccounts();
  });

  if (!accounts.length || !hasAdvanceableAccount(accounts)) {
    dogstatsd.increment('bank_connection.upsert_bank_accounts.no_supported_accounts', {
      source: connection.bankingDataSource,
      institution_id: String(connection.institutionId),
    });
    throw new UnsupportedBankConnection(UnsupportedErrorKey.UnsupportedBankConnection, {
      interpolations: {
        bankingDataSource: connection.bankingDataSource,
        externalId: connection.externalId,
      },
    });
  }

  const upserted = await Bluebird.mapSeries(accounts, async acc => {
    const bankAccount = await upsert(acc, connection);

    const { account, routing } = acc;
    if (bankAccount && account && routing) {
      // sus that this isn't going to get triggered
      dogstatsd.increment('bank_connection.upsert_bank_accounts.account_and_routing_returned');
      const accountRoutingHash = BankAccount.hashAccountNumber(account, routing);
      if (accountRoutingHash !== bankAccount.accountNumber) {
        // The bankAccount gets mutated here, no need to assign returned value.
        await AccountAndRouting.addAccountAndRouting(bankAccount, { account, routing });
      }
    }

    return bankAccount;
  });
  const withoutDeleted = compact(upserted);

  await handleExternalIdChanges(withoutDeleted, connection);

  await cacheBankAccountBalances(accounts);

  return withoutDeleted;
}

function hasAdvanceableAccount(bankingDataSourceAccounts: BankAccountResponse[]): boolean {
  const advanceable = bankingDataSourceAccounts.filter(
    a =>
      a.type === BankAccountType.Depository &&
      [
        BankAccountSubtype.Checking,
        BankAccountSubtype.PrepaidDebit,
        BankAccountSubtype.Prepaid,
      ].includes(a.subtype),
  );
  return advanceable.length > 0;
}

async function upsert(
  account: BankAccountResponse,
  connection: BankConnection,
): Promise<BankAccount> {
  const attrs: Partial<BankAccount> = {
    bankConnectionId: connection.id,
    userId: connection.userId,
    institutionId: connection.institutionId,
    externalId: account.externalId,
    lastFour: account.lastFour,
    displayName: account.nickname,
    current: account.current,
    available: account.available,
    type: account.type,
    subtype: account.subtype,
  };

  return sequelize.transaction(async transaction => {
    let resultAccount = await BankAccount.findOne({
      where: {
        externalId: account.externalId,
      },
      paranoid: false,
      transaction,
    });
    if (resultAccount && resultAccount.deleted) {
      return null;
    } else if (resultAccount) {
      await resultAccount.update(attrs, { transaction });
    } else {
      resultAccount = await BankAccount.create(attrs, { transaction });
    }

    return resultAccount;
  });
}

export async function findOneAndHandleSoftDeletes(
  bankAccountId: number,
  user: User,
  options: {
    bankAccountIdFrom: 'params' | 'body';
  },
): Promise<BankAccount> {
  const bankAccount = await BankAccount.findByPk(bankAccountId, {
    include: [BankConnection],
    paranoid: false,
  });

  if (bankAccount && bankAccount.deleted && user.defaultBankAccountId === bankAccount.id) {
    throw new DefaultAccountRemovedError(FailureMessageKey.DefaultAccountDisconnected);
  }

  if (!bankAccount || bankAccount.deleted) {
    if (options.bankAccountIdFrom === 'body') {
      throw new InvalidParametersError(NotFoundMessageKey.BankAccountNotFound);
    }

    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: { bankAccountId },
    });
  }

  if (bankAccount.userId !== user.id) {
    /**
     * Obfuscate whether a bankAccountId exists, since
     * this endpoint may be accessible to users
     */
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFound);
  }

  return bankAccount;
}
