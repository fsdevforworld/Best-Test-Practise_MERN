import { Transaction } from 'sequelize/types';
import { AuditLog, BankAccount, BankConnection, Institution } from '../../models';
import {
  BankAccountResponse,
  BankConnectionUpdateType,
  BankingDataSourceErrorType,
  PlaidErrorCode,
} from '../../typings';
import { retry } from '../../lib/utils';
import { dogstatsd } from '../../lib/datadog-statsd';
import { BankConnectionUpdate } from '../../models/warehouse';
import { BankingDataSourceError } from '../banking-data-source/error';
import { moment, Moment } from '@dave-inc/time-lib';
import * as Bluebird from 'bluebird';
import { createBroadcastBankDisconnectTask } from '../../jobs/data';
import { NotFoundError } from '../../lib/error';
import { generateBankingDataSource } from '../banking-data-source';
import { BankingDataSource } from '@dave-inc/wire-typings';

export async function getAccountsWithAccountAndRouting(
  connection: BankConnection,
): Promise<BankAccountResponse[]> {
  const DD_METRIC = 'bank_connection.get_accounts_with_account_and_routing';
  try {
    const bankingDataSource = await generateBankingDataSource(connection);

    const accounts = await retry(() => bankingDataSource.getAccountsWithAccountAndRouting());
    await AuditLog.create({
      userId: connection.userId,
      type: 'BANK_CONNECTION_GET_AUTH_SUCCESS',
      extra: {
        bankConnectionId: connection.id,
        source: connection.bankingDataSource,
        institutionId: connection.institutionId,
        accounts: accounts.map(({ externalId, account, routing }) => ({
          externalId,
          account: !!account,
          routing: !!routing,
        })),
      },
    });
    dogstatsd.increment('bank_connection.get_auth_success', {
      source: connection.bankingDataSource,
      institution_id: String(connection.institutionId),
    });

    return accounts;
  } catch (error) {
    dogstatsd.increment('bank_connection.get_auth_error', {
      source: connection.bankingDataSource,
      errorCode: error.errorCode,
      errorType: error.errorType,
      institution_id: String(connection.institutionId),
    });
    const institution = await Institution.findByPk(connection.institutionId);

    await BankConnectionUpdate.create({
      userId: connection.userId,
      bankConnectionId: connection.id,
      type: 'BANK_CONNECTION_GET_AUTH_ERROR',
      extra: {
        serializedError: error,
        source: connection.bankingDataSource,
        institutionName: institution.displayName,
        institutionId: institution.id,
      },
    });

    if (error.errorCode === PlaidErrorCode.InstitutionNotResponding) {
      dogstatsd.increment(`${DD_METRIC}.pass_on_institution_not_responding`, {
        source: connection.bankingDataSource,
        institution_id: String(institution.id),
      });

      return null;
    } else if (error.errorType === BankingDataSourceErrorType.InternalServerError) {
      dogstatsd.increment(`${DD_METRIC}.pass_on_internal_server_error`, {
        source: connection.bankingDataSource,
        institution_id: String(institution.id),
      });

      return null;
    }

    const isNonAuthInstitution =
      error.errorType === BankingDataSourceErrorType.AccountNumbersNotSupported ||
      // TODO - Move plaid logic to serializer and throw generic BankingDataSourceErrorType.AccountNumbersNotSupported
      (error.errorCode === PlaidErrorCode.ProductsNotSupported &&
        error.message.match(/not supported by this institution.*?\bauth\b/));
    const hasNoAuthAccounts = error.errorCode === PlaidErrorCode.NoAuthAccounts;

    if (isNonAuthInstitution || hasNoAuthAccounts) {
      dogstatsd.increment('bank_connection.no_auth_account', {
        institution_id: String(institution.id),
        source: connection.bankingDataSource,
      });
      await AuditLog.create({
        userId: connection.userId,
        type: 'NO_AUTH_ACCOUNT',
        successful: false,
        eventUuid: connection.id,
        extra: {
          errorCode: error.errorCode,
          errorMessage: error.message,
          externalId: connection.externalId,
          institutionName: institution.displayName,
          source: connection.bankingDataSource,
          plaidInstitutionId: institution.plaidInstitutionId,
          mxInstitutionCode: institution.mxInstitutionCode,
        },
      });

      return null;
    } else {
      dogstatsd.increment(`${DD_METRIC}.error`, {
        source: connection.bankingDataSource,
        institution_id: String(institution.id),
      });

      throw error;
    }
  }
}

export async function saveBankingDataSourceErrorCode(
  connection: BankConnection,
  error: BankingDataSourceError,
  time?: Moment,
) {
  const errorCode = error.errorCode;
  const { bankingDataSourceErrorCode, userId, id: bankConnectionId } = connection;

  if (errorCode !== bankingDataSourceErrorCode) {
    await connection.sequelize.transaction(async t => {
      await connection.update(
        {
          bankingDataSourceErrorCode: errorCode,
          bankingDataSourceErrorAt: moment(time),
        },
        { transaction: t },
      );

      await BankConnectionUpdate.create({
        userId,
        bankConnectionId,
        type: BankConnectionUpdateType.DATA_SOURCE_ERROR,
        extra: { error },
      });
    });
  }

  await handleDisconnect(connection, error);
}

export async function handleDisconnect(connection: BankConnection, error: BankingDataSourceError) {
  dogstatsd.increment('bank_connection.disconnects', [`error_type:${error.errorType}`]);

  if (
    error.errorType !== BankingDataSourceErrorType.Disconnected &&
    error.errorType !== BankingDataSourceErrorType.UserInteractionRequired &&
    error.errorType !== BankingDataSourceErrorType.NoLongerSupported
  ) {
    return;
  }

  const { id, hasValidCredentials, institutionId } = connection;

  if (!hasValidCredentials) {
    dogstatsd.increment('bank_connection.handle_disconnect.already_disconnected');
    return;
  }

  await Bluebird.all([
    BankConnectionUpdate.create({
      userId: connection.userId,
      bankConnectionId: id,
      type: BankConnectionUpdateType.DISCONNECTED,
      extra: { error },
    }),
    connection.update({ hasValidCredentials: false }),
    createBroadcastBankDisconnectTask({
      userId: connection.userId,
      institutionId,
      bankConnectionId: connection.id,
      time: moment().valueOf() as number,
    }),
  ]);
}

export async function setConnectionStatusAsValid(
  connection: BankConnection,
  extra: { type: string },
) {
  const { hasValidCredentials, institutionId, bankingDataSource } = connection;
  let setAsReconnected = true;

  if (hasValidCredentials === false) {
    //TODO We are doing this to make sure MX webhooks do not mark MX bank connections as valid so we can
    //     migrate off of MX. The MX clause should be removed once this is done.
    if (bankingDataSource === BankingDataSource.Mx || institutionId === 3) {
      setAsReconnected = false;
    } else {
      await BankConnectionUpdate.create({
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: BankConnectionUpdateType.RECONNECTED,
        extra,
      });
    }
  }
  await connection.update({
    hasValidCredentials: setAsReconnected,
    bankingDataSourceErrorCode: null,
    bankingDataSourceErrorAt: null,
  });
}

/**
 * Ensures bank connection primary account ID is in sync with a user's default bank account ID
 *
 * NOTE: user.defaultBankAccountId will soon be deprecated, as we will start to rely on the
 * bank connection's primary account ID
 *
 * @param {number} userDefaultBankAccountId
 * @returns {Promise<void>}
 */

interface ISyncOptions {
  transaction?: Transaction;
}

export async function syncUserDefaultBankAccount(
  userDefaultBankAccountId: number,
  { transaction }: ISyncOptions = {},
): Promise<void> {
  const bankAccount = await BankAccount.findByPk(userDefaultBankAccountId, { transaction });
  if (!bankAccount) {
    throw new NotFoundError(`Cannot find bank account with id: ${userDefaultBankAccountId}`);
  }

  const connection = await bankAccount.getBankConnection({ transaction });
  if (connection.primaryBankAccountId !== userDefaultBankAccountId) {
    await connection.update({ primaryBankAccountId: userDefaultBankAccountId }, { transaction });
  }
}
