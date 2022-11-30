import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';
import { BankConnection, User, sequelize } from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import { dogstatsd } from '../../lib/datadog-statsd';
import { Op } from 'sequelize';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { isDevEnv } from '../../lib/utils';
import { addAccountAndRoutingToAccounts, upsertBankAccounts } from './bank-accounts';
import { queueMissedBankConnectionUpdates } from './bank-connection-update';
import { bankConnectionUpdateEvent } from '../event';

export async function createBankAccounts(
  connection: BankConnection,
  user: User,
  {
    fetchAccountAndRouting = true,
    shouldDeleteExistingNonBodConnections = true,
  }: CreateBankAccountsOptions = {},
) {
  let accounts = await upsertBankAccounts(connection);
  if (fetchAccountAndRouting) {
    accounts = await addAccountAndRoutingToAccounts(connection, accounts);
  }
  await BankConnectionUpdate.create({
    userId: connection.userId,
    bankConnectionId: connection.id,
    type: 'BANK_CONNECTION_ACCOUNTS_ADDED',
    extra: {
      bankingDataSource: connection.bankingDataSource,
      accounts: accounts.length,
      authAccounts: accounts.map(({ id, accountNumber }) => ({
        id,
        accountNumber: !!accountNumber,
      })),
    },
  });

  dogstatsd.increment('bank_connection.create_bank_accounts.bank_accounts_added', {
    institution_id: String(connection.institutionId),
    source: connection.bankingDataSource,
  });

  if (shouldDeleteExistingNonBodConnections) {
    const existingNonBodConnections = await BankConnection.findAll({
      where: { userId: user.id, bankingDataSource: { [Op.ne]: BankingDataSource.BankOfDave } },
    });

    await Bluebird.all(
      existingNonBodConnections
        .filter(conn => conn.id !== connection.id)
        .map(conn => deleteBankConnection(conn)),
    );
  }

  await queueMissedBankConnectionUpdates(connection);

  if (
    isDevEnv() ||
    // Race condition for MX users in the MFA flow - MX gives us a webhook while they are connecting, and we
    // process it quickly and upsert bank transactions, but end up deleting the connection when they hit MFA
    // MX will not re-send the webhook once answering MFA questions, so they get stuck with no bank transactions
    // TODO - Find a better solution
    connection.bankingDataSource === BankingDataSource.Mx
  ) {
    await bankConnectionUpdateEvent.publish({
      itemId: connection.externalId,
      source: connection.bankingDataSource,
      initial: true,
      historical: true,
    });
  }

  // Prevent user from having to select single account manually.
  // Need to do this after deleting bank connections else getSupported will return old ones
  const supportedBankAccounts = accounts.filter(ba => ba.isSupported());
  if (supportedBankAccounts.length === 1) {
    const defaultBankAccountId = supportedBankAccounts[0].id;

    await sequelize.transaction(async transaction => {
      await user.update({ defaultBankAccountId }, { transaction });
      await connection.update({ primaryBankAccountId: defaultBankAccountId }, { transaction });
    });
  } else {
    await user.update({ defaultBankAccountId: null });
  }

  dogstatsd.increment('bank_connection.create_bank_accounts.default_account_set', {
    institution_id: String(connection.institutionId),
    source: connection.bankingDataSource,
  });

  return supportedBankAccounts;
}
