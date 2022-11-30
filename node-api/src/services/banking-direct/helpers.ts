import {
  AccountStatus,
  ApiAccountType,
  IInternalApiBankAccount,
  IInternalApiTransaction,
  INotFoundErrorApiResponseCustomCodeEnum,
  IUnauthorizedErrorResponseCustomCodeEnum,
  IValidationErrorResponseCustomCodeEnum,
  TransactionStatus,
} from '@dave-inc/banking-internal-api-client';
import { BankAccountType, BankAccountSubtype } from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import { get, isEmpty } from 'lodash';
import getClient from '../../domain/bank-of-dave-internal-api';
import { dogstatsd } from '../../lib/datadog-statsd';
import { User, BankingDirectUserSession } from '../../models';
import { BankingDirectError, CUSTOM_ERROR_CODES } from '../../lib/error';
import { PlaidUserResponse, PlaidTransaction, PlaidTransactionResponse } from '../../typings';

export const BankingInternalApiClient = getClient(); // Exported for tests.

/**
 * Return an unauthorized error back to third party.
 **/
function throwUnauthorizedError(message?: string): never {
  dogstatsd.increment('banking_direct.error', [`error_type:unauthorized`]);
  throw new BankingDirectError(
    message || 'Invalid credential pair',
    401,
    CUSTOM_ERROR_CODES.BANKING_DIRECT_UNAUTHORIZED,
  );
}

/**
 * Return a bad request error back to third party. This indicates
 * that parameters to method were incorrect.
 **/
function throwBadRequestError(message?: string): never {
  dogstatsd.increment('banking_direct.error', [`error_type:bad_request`]);
  throw new BankingDirectError(
    message || 'Bad request',
    400,
    CUSTOM_ERROR_CODES.BANKING_DIRECT_BAD_REQUEST,
  );
}

/**
 * Return an internal server error back to third party.
 **/
function throwUnhandledError(message?: string, error?: Error): never {
  dogstatsd.increment('banking_direct.error', [`error_type:unhandled`]);
  throw new BankingDirectError(
    message || 'Internal server error',
    502,
    CUSTOM_ERROR_CODES.BANKING_DIRECT_UNHANDLED_ERROR,
    error,
  );
}

/**
 * Gets dave banking accounts for this user from the banking api
 * and transforms error for third-party (based on spec).
 **/
async function fetchDaveSpendingAccount(user: User): Promise<IInternalApiBankAccount> {
  const daveBankingUUID: string = await user.getDaveBankingUUID();

  if (!daveBankingUUID) {
    throwUnauthorizedError('Account uuid not found');
  }

  let accounts: IInternalApiBankAccount[];
  try {
    const response = await BankingInternalApiClient.getUserBankAccounts(user.id);
    accounts = get(response, ['data', 'bankAccounts'], []);
  } catch (error) {
    if (error.customCode === IValidationErrorResponseCustomCodeEnum.ValidationError) {
      throwBadRequestError();
    }
    if (error.customCode === IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized) {
      throwUnauthorizedError('Unauthorized banking user');
    }
    if (error.customCode === INotFoundErrorApiResponseCustomCodeEnum.NotFound) {
      throwUnauthorizedError('Account not found');
    }
    throwUnhandledError('Non success returned from dave banking api', error);
  }

  const spendingAccount = accounts.find(account => account.accountType === ApiAccountType.Checking);

  if (!spendingAccount) {
    throwUnauthorizedError('No checking account found');
  }

  return spendingAccount;
}

/**
 * Gets dave banking transactions for account from the banking api
 * and transforms error for third-party (based on spec).
 **/
async function fetchDaveBankingTransactions(params: {
  bankAccountId: string;
  startsAt: string;
  endsAt: string;
  page: number;
  perPage: number;
}): Promise<IInternalApiTransaction[]> {
  const response = await BankingInternalApiClient.getBankAccountTransactions(
    params.bankAccountId,
    params.startsAt,
    params.endsAt,
    params.page,
    params.perPage,
  ).catch(error => {
    if (error.customCode === IValidationErrorResponseCustomCodeEnum.ValidationError) {
      throwBadRequestError();
    }
    if (error.customCode === IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized) {
      throwUnauthorizedError('Unauthorized banking user');
    }
    if (error.customCode === INotFoundErrorApiResponseCustomCodeEnum.NotFound) {
      throwUnauthorizedError('Transactions not found');
    }
    throwUnhandledError('Non success returned from dave banking api', error);
  });

  return get(response, ['data', 'transactions'], []);
}

/** Ensure we have a valid dave checking account */
async function validateDaveBanking(user: User): Promise<void> {
  const isDaveBankingUser: boolean = await user.hasDaveBanking();
  if (!isDaveBankingUser) {
    throwUnauthorizedError('User does not have dave banking connection');
  }

  const daveBankingCheckingAccount = await fetchDaveSpendingAccount(user);

  if (daveBankingCheckingAccount.status !== AccountStatus.Active) {
    throwUnauthorizedError('Dave banking account is locked');
  }
}

/** Validates the password sent from the third party */
async function validatePassword(user: User, password: string): Promise<void> {
  const isValidated: boolean = await bcrypt.compare(password, user.password);
  if (!isValidated) {
    throwUnauthorizedError();
  }
}

/** Validates the user by email and password, creates the banking direct session and returns the token */
export async function verifyUser(
  userName: string,
  password: string,
): Promise<{ authToken: string; userId: number }> {
  if (!userName || !password) {
    throwUnauthorizedError();
  }

  try {
    const user: User = await User.findOneByEmail(userName);
    if (!user) {
      throwUnauthorizedError();
    }

    await validatePassword(user, password);
    await validateDaveBanking(user);

    const newSession: BankingDirectUserSession = await BankingDirectUserSession.create({
      userId: user.id,
    });

    return {
      authToken: newSession.token,
      userId: user.id,
    };
  } catch (error) {
    // Whether it errored out because password was null or or any other reason, we keep isValidated falsey
    dogstatsd.increment('banking_direct.error', [
      `error_type:login_with_password_decryption_error`,
    ]);
    throw error;
  }
}

export async function getCheckingAccountInfo(user: User): Promise<PlaidUserResponse> {
  const daveBankingConnectionExternalId: string = await user.getDaveBankingUUID();

  const daveBankingCheckingAccount = await fetchDaveSpendingAccount(user);

  return {
    identities: [
      {
        id: daveBankingConnectionExternalId,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        address: user.addressLine1,
        address2: user.addressLine2,
        city: user.city,
        state: user.state,
        postalCode: user.zipCode,
        phone: user.phoneNumber,
      },
    ],
    accounts: [
      {
        id: daveBankingCheckingAccount.id,
        ownerIdentities: [daveBankingConnectionExternalId],
        type: BankAccountType.Depository.toLowerCase(),
        subtype: BankAccountSubtype.Checking.toLowerCase(),
        currency: 'USD',
        name: 'Dave Banking',
        currentBalance: daveBankingCheckingAccount.currentBalance.toFixed(2),
        availableBalance: daveBankingCheckingAccount.currentBalance.toFixed(2),
        routingNumber: daveBankingCheckingAccount.routingNumber,
        wireRouting: daveBankingCheckingAccount.routingNumber,
        accountNumber: daveBankingCheckingAccount.accountNumber,
      },
    ],
  };
}

export async function getCheckingAccountTransactions(
  user: User,
  start: number,
  limit: number,
  startsAt: string,
  endsAt: string,
): Promise<PlaidTransactionResponse> {
  const daveBankingConnectionExternalId = await user.getDaveBankingUUID();

  const daveBankingCheckingAccount = await fetchDaveSpendingAccount(user);

  const page = start ? start + 1 : 1;
  const perPage = limit && limit !== 0 ? limit : 500;

  const rawTransactions = await fetchDaveBankingTransactions({
    bankAccountId: daveBankingCheckingAccount.id,
    startsAt,
    endsAt,
    page,
    perPage,
  });

  return toPlaidTransactionResponse(
    rawTransactions,
    daveBankingCheckingAccount.id,
    daveBankingConnectionExternalId,
  );
}

function toPlaidTransactionResponse(
  transactions: IInternalApiTransaction[],
  accountId: string,
  spenderIdentity: string,
) {
  if (isEmpty(transactions)) {
    return {
      total: 0,
      transactions: [],
    };
  }

  return {
    total: transactions.length,
    transactions: transactions.reduce((acc, transaction) => {
      const { status } = transaction;
      const serializedTransaction: PlaidTransaction = {
        id: transaction.id,
        accountId,
        /**
         * Plaid's convention for transaction signs is that inflows into an account are negative and outflows are positive.
         *   On Dave Banking transaction signs are the inverse of this logic. Therefore, we need to flip the sign for
         *   transactions that come from the Internal API.
         */
        amount: transaction.amount * -1,
        currency: 'USD',
        description: transaction.name,
        pending: transaction.status === TransactionStatus.Pending,
        transactedAt: transaction.transactedAt,
        settledAt: transaction.settledAt,
        spenderIdentity,
      };

      // Filter any transaction that's not pending or settled (Ex: cancelled or returned)
      switch (status) {
        case TransactionStatus.Pending:
        case TransactionStatus.Settled:
          return [...acc, serializedTransaction];
        default:
          return acc;
      }
    }, []),
  };
}
