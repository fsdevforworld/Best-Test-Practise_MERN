import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import { get } from 'lodash';

import {
  BankAccountResponse,
  BankingDataSourceErrorType,
  BankNexusResponse,
  BankTransactionResponse,
  MxAccount,
  MxAccountNumber,
  MxAccountSubtype,
  MxAccountType,
  MxConnectionStatus,
  MxError,
  MxMember,
  MxTransaction,
  MxTransactionStatus,
  MxTransactionType,
  SUPPORTED_BANK_ACCOUNT_SUBTYPES,
  SUPPORTED_BANK_ACCOUNT_TYPE,
} from '../../../typings';

import { moment } from '@dave-inc/time-lib';
import { BankingDataSourceError } from '../error';
import { MX_CONNECTED_STATUSES } from './integration';

export default class MxDataSerializer {
  /**
   * Serializes Mx's member object into our internal bank nexus object
   *
   * @param {MxMember} nexus
   * @returns {BankNexusResponse}
   */
  public static serializeNexus(nexus: MxMember): BankNexusResponse {
    return {
      externalId: nexus.guid,
      externalInstitutionId: nexus.institutionCode,
      authToken: nexus.guid,
    };
  }

  /**
   * Serializes a list of Mx bank accounts to a list of our internal bank account objects
   *
   * @param {MxAccount[]} accounts
   * @param {MxAccountNumber[]} numbers
   * @returns {BankAccountResponse[]}
   */
  public static serializeBankAccounts(
    accounts: MxAccount[],
    numbers: MxAccountNumber[] = [],
  ): BankAccountResponse[] {
    return accounts
      .filter(account => {
        const { type, subtype } = this.mapAccountTypeAndSubtype(
          account.type as MxAccountType,
          account.subtype as MxAccountSubtype,
        );

        // Only include supported accounts
        return (
          SUPPORTED_BANK_ACCOUNT_TYPE.includes(type) &&
          SUPPORTED_BANK_ACCOUNT_SUBTYPES.includes(subtype)
        );
      })
      .map(account => this.serializeBankAccount(account, numbers));
  }

  /**
   * Serializes a list of Mx bank account transactions to a list of our internal bank transaction objects
   *
   * @param {MxTransaction[]} transactions
   * @returns {BankTransactionResponse[]}
   */
  public static serializeTransactions(transactions: MxTransaction[]): BankTransactionResponse[] {
    return transactions.map(transaction => {
      return {
        externalId: transaction.guid,
        pendingExternalId: transaction.guid,
        bankAccountExternalId: transaction.accountGuid,
        amount:
          transaction.type === MxTransactionType.Credit ? transaction.amount : -transaction.amount,
        transactionDate: moment(transaction.transactedAt),
        pending: transaction.status === MxTransactionStatus.Pending,
        externalName: transaction.description,
        plaidCategory: [transaction.category],
      };
    });
  }

  /**
   * Serializes MX request error into our internally recognized banking data source error
   *
   * @param {MxError | Error} error
   * @returns {BankingDataSourceError}
   */
  public static serializeError(error: MxError | Error): BankingDataSourceError {
    const message: string = get(
      error,
      'response.body.error.message',
      error.message || 'Unknown Error',
    );
    const status: number = get(error, 'response.statusCode', 500);

    const errorType = ((): BankingDataSourceErrorType => {
      // MX doesn't supply error codes, need to pull out specific errors from message / status code
      if (message.includes('does not support instant account verification')) {
        return BankingDataSourceErrorType.AccountNumbersNotSupported;
      } else if (status.toString().startsWith('5')) {
        return BankingDataSourceErrorType.InternalServerError;
      } else {
        return BankingDataSourceErrorType.InvalidRequest;
      }
    })();

    return new BankingDataSourceError(
      message,
      BankingDataSource.Mx,
      status.toString(),
      errorType,
      { error },
      status,
    );
  }

  /**
   * Maps MX's disconnected connection status to our internally recognized banking data source error type
   *
   * @param {MxConnectionStatus} disconnectedStatus
   * @returns {BankingDataSourceErrorType}
   */
  public static mapDisconnectedStatusToErrorType(
    disconnectedStatus: MxConnectionStatus,
  ): BankingDataSourceErrorType {
    if (MX_CONNECTED_STATUSES.includes(disconnectedStatus)) {
      throw new Error(`Status was unexpectedly connected: ${disconnectedStatus}`);
    }

    switch (disconnectedStatus) {
      case MxConnectionStatus.Prevented:
      case MxConnectionStatus.Denied:
      case MxConnectionStatus.Challenged:
      case MxConnectionStatus.Rejected:
      case MxConnectionStatus.Imported:
      case MxConnectionStatus.Impaired:
      case MxConnectionStatus.Locked:
      case MxConnectionStatus.Impeded:
        return BankingDataSourceErrorType.UserInteractionRequired;

      case MxConnectionStatus.Degraded:
      case MxConnectionStatus.Delayed:
      case MxConnectionStatus.Failed:
      case MxConnectionStatus.Disabled:
      case MxConnectionStatus.Expired:
        return BankingDataSourceErrorType.InstitutionError;

      case MxConnectionStatus.Disconnected:
      case MxConnectionStatus.Closed:
        return BankingDataSourceErrorType.Disconnected;

      case MxConnectionStatus.Discontinued:
        return BankingDataSourceErrorType.NoLongerSupported;

      case MxConnectionStatus.Resumed:
      case MxConnectionStatus.Updated:
      default:
        return BankingDataSourceErrorType.NoOp;
    }
  }

  /**
   * Serializes an Mx bank account to our internal bank account object
   *
   * @param {Account} account
   * @param {AccountNumber[]} numbers
   * @returns {BankAccountResponse}
   */
  private static serializeBankAccount(
    account: MxAccount,
    numbers: MxAccountNumber[],
  ): BankAccountResponse {
    const { type, subtype } = this.mapAccountTypeAndSubtype(
      account.type as MxAccountType,
      account.subtype as MxAccountSubtype,
    );

    let accountNumber;
    let routingNumber;

    const accountNumbers = numbers.find(({ accountGuid }) => accountGuid === account.guid);
    if (accountNumbers) {
      accountNumber = accountNumbers.accountNumber;
      routingNumber = accountNumbers.routingNumber;
    }

    return {
      bankingDataSource: BankingDataSource.Mx,
      externalId: account.guid,
      available: account.availableBalance,
      current: account.balance,
      lastFour: accountNumber ? accountNumber.slice(-4) : null,
      nickname: account.name,
      account: accountNumber,
      routing: routingNumber,
      type,
      subtype,
    };
  }

  /**
   * Maps Mx's bank account type/subtype to our internally recognized type/subtype
   *
   * @param {MxAccountType} accountType
   * @param {MxAccountSubtype} accountSubtype
   * @returns {{type: BankAccountType, subtype: BankAccountSubtype}}
   */
  private static mapAccountTypeAndSubtype(
    accountType: MxAccountType,
    accountSubtype: MxAccountSubtype,
  ): {
    type: BankAccountType;
    subtype: BankAccountSubtype;
  } {
    const subtype = this.mapAccountSubtype(accountSubtype);

    switch (accountType) {
      case MxAccountType.Checking:
        return { type: BankAccountType.Depository, subtype: BankAccountSubtype.Checking };
      case MxAccountType.Prepaid:
        return { type: BankAccountType.Depository, subtype: BankAccountSubtype.Prepaid };
      case MxAccountType.Loan:
        return { type: BankAccountType.Loan, subtype };
      case MxAccountType.LineOfCredit:
      case MxAccountType.CreditCard:
        return { type: BankAccountType.Credit, subtype };
      default:
        return { type: BankAccountType.Other, subtype };
    }
  }

  /**
   * Maps Mx's bank account subtype to our internally recognized subtype
   *
   * @param {MxAccountSubtype} accountSubtype
   * @returns {BankAccountSubtype}
   */
  private static mapAccountSubtype(accountSubtype: MxAccountSubtype): BankAccountSubtype {
    switch (accountSubtype) {
      case MxAccountSubtype.MoneyMarket:
        return BankAccountSubtype.MoneyMarket;
      case MxAccountSubtype.CertificateOfDeposit:
        return BankAccountSubtype.CD;
      case MxAccountSubtype.Auto:
        return BankAccountSubtype.Auto;
      case MxAccountSubtype.Student:
        return BankAccountSubtype.Student;
      case MxAccountSubtype.HomeEquity:
        return BankAccountSubtype.HomeEquity;
      default:
        return BankAccountSubtype.Other;
    }
  }
}
