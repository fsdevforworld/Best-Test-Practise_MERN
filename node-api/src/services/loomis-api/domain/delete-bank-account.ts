import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { BankConnection, User, BankAccount } from '../../../models';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { Op } from 'sequelize';
import { InvalidParametersError } from '../../../lib/error';
import { BankConnectionUpdate } from '../../../models/warehouse';
import { removeRelationships } from '../../../domain/banking-data-sync/delete-bank-account';
import { generateBankingDataSource } from '../../../domain/banking-data-source';

function getDeletionRestrictions(connection: BankConnection) {
  return Promise.all([
    connection.hasPayments({ status: ExternalTransactionStatus.Pending }),
    connection.hasAdvances({ outstanding: { [Op.gt]: 0 } }),
  ]);
}

async function validateDeletion(connection: BankConnection) {
  const [hasPendingPayments, hasOutstandingAdvances] = await getDeletionRestrictions(connection);

  if (hasOutstandingAdvances) {
    dogstatsd.increment('delete_bank_connection.cannot_be_deleted_error', {
      error_type: 'has_outstanding_advances',
      source: connection.bankingDataSource,
    });

    throw new InvalidParametersError('Cannot delete a bank connection with outstanding advances.');
  }

  if (hasPendingPayments) {
    dogstatsd.increment('delete_bank_connection.cannot_be_deleted_error', {
      error_type: 'has_pending_payments',
      source: connection.bankingDataSource,
    });

    throw new InvalidParametersError('Cannot delete a bank connection with pending payments');
  }
}

interface IDeleteBankConnectionOptions {
  force?: boolean;
  deleteBankingDataSource?: boolean;
  admin?: number;
  validate?: boolean;
}

async function deleteBankConnection(
  connection: BankConnection,
  {
    force = false,
    deleteBankingDataSource = true,
    admin,
    validate = true,
  }: IDeleteBankConnectionOptions = {},
): Promise<void> {
  if (!connection) {
    return null;
  }

  if (validate) {
    await validateDeletion(connection);
  }

  if (deleteBankingDataSource) {
    try {
      const bankingDataSource = await generateBankingDataSource(connection);
      await bankingDataSource.deleteNexus();
    } catch (err) {
      dogstatsd.increment('delete_bank_connection.error', {
        source: connection.bankingDataSource,
      });
    }
  }

  await removeBankAccountRelationships(connection);

  if (force) {
    await connection.hardDelete();
  } else {
    await connection.softDelete();
  }
  dogstatsd.increment('bank_connection.delete', {
    force: force ? 'true' : 'false',
    source: connection.bankingDataSource,
  });
  await BankConnectionUpdate.create({
    userId: connection.userId,
    bankConnectionId: connection.id,
    type: 'BANK_CONNECTION_DELETED',
    extra: { force, deleteBankingDataSource, admin },
  });
}

async function removeBankAccountRelationships(connection: BankConnection) {
  const user = await User.findByPk(connection.userId);

  const accounts = await BankAccount.findAll({
    where: { bankConnectionId: connection.id },
  });
  await Bluebird.mapSeries(accounts, async connectionAccount => {
    await removeRelationships(connectionAccount, user);
  });
}

export { deleteBankConnection, getDeletionRestrictions, removeBankAccountRelationships };
