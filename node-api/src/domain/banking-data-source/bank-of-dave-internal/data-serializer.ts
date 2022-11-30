import * as openapi from '@dave-inc/banking-internal-api-client';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { get } from 'lodash';
import logger from '../../../lib/logger';
import {
  BankAccountResponse,
  BankingDataSourceErrorType,
  BankTransactionResponse,
  DaveBankingErrorCode,
} from '../../../typings';
import { BankingDataSourceError } from '../error';

const DAVE_BANKING_ACCOUNT_TYPE_TO_SUBTYPE: {
  [K in openapi.ApiAccountType]?: BankAccountSubtype;
} = {
  [openapi.ApiAccountType.Checking]: BankAccountSubtype.Checking,
  [openapi.ApiAccountType.Goal]: BankAccountSubtype.Savings,
  [openapi.ApiAccountType.ExtraCash]: BankAccountSubtype.Overdraft,
};

export class BankOfDaveInternalApiDataSerializer {
  public serializeBankAccount(account: openapi.IInternalApiBankAccount): BankAccountResponse {
    const subtype =
      DAVE_BANKING_ACCOUNT_TYPE_TO_SUBTYPE[account.accountType] || BankAccountSubtype.Other;

    return {
      bankingDataSource: BankingDataSource.BankOfDave,
      externalId: account.id,
      available: account.currentBalance,
      current: account.currentBalance,
      lastFour: account.accountNumber.slice(-4),
      nickname: account.name,
      account: account.accountNumber,
      type: BankAccountType.Depository, // all Dave Banking accounts are Depository accounts
      subtype,
      routing: account.routingNumber,
    };
  }

  public serializeTransactions(
    accountId: string,
    txns: openapi.IInternalApiTransactionsResponse,
  ): BankTransactionResponse[] {
    return txns.transactions.map(t => this.serializeTransaction(accountId, t));
  }
  public serializeError(error: Error): BankingDataSourceError {
    const status: number = get(error, 'response.status', 500);
    const errorCode: string = get(error, 'response.data.customCode', 'Unknown');

    return new BankingDataSourceError(
      error.message,
      BankingDataSource.BankOfDave,
      this.determineErrorCode(errorCode),
      this.determineErrorType(errorCode),
      {},
      status,
    );
  }

  private determineErrorType(errorCode: string): BankingDataSourceErrorType {
    switch (errorCode) {
      case openapi.INotFoundErrorApiResponseCustomCodeEnum.NotFound:
      case openapi.IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized:
      case openapi.IValidationErrorResponseCustomCodeEnum.ValidationError:
        return BankingDataSourceErrorType.InvalidRequest;

      default:
        logger.error(`Encountered unknown error code: ${errorCode}`);
        return BankingDataSourceErrorType.NoOp;
    }
  }

  private determineErrorCode(errorCode: string): DaveBankingErrorCode {
    switch (errorCode) {
      case openapi.INotFoundErrorApiResponseCustomCodeEnum.NotFound:
        return DaveBankingErrorCode.NotFoundError;
      case openapi.IUnauthorizedErrorResponseCustomCodeEnum.Unauthorized:
        return DaveBankingErrorCode.AuthorizationError;
      case openapi.IValidationErrorResponseCustomCodeEnum.ValidationError:
        return DaveBankingErrorCode.RequestError;

      default:
        return DaveBankingErrorCode.InternalError;
    }
  }

  private serializeTransaction(
    accountId: string,
    txn: openapi.IInternalApiTransaction,
  ): BankTransactionResponse {
    const transactionDateString = moment(txn.transactedAt)
      .tz(DEFAULT_TIMEZONE)
      .format('YYYY-MM-DD');

    return {
      externalId: txn.id,
      bankAccountExternalId: accountId,
      amount: txn.amount,
      transactionDate: moment(transactionDateString),
      pending: txn.status === openapi.TransactionStatus.Pending,
      externalName: txn.name,
      plaidCategory: [],
      plaidCategoryId: txn.mcc,
      referenceNumber: txn.id,
    };
  }
}
