import {
  BankAccountResponse,
  BankingDataSourceErrorType,
  BankNexusResponse,
  BankTransactionResponse,
  IExtendedPlaidError,
  PlaidAccountAndRouting,
  PlaidErrorCode,
} from '../../../typings';
import { camelCase, capitalize, compact } from 'lodash';
import { Account, Item, TransactionsResponse } from 'plaid';
import { BankingDataSourceError } from '../error';
import { moment } from '@dave-inc/time-lib';
import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';

export class PlaidDataSerializer {
  public static supportedBankAccountTypes = [
    BankAccountType.Loan,
    BankAccountType.Depository,
    BankAccountType.Credit,
  ];

  public static serializeNexus(accessToken: string, nexus: Item): BankNexusResponse {
    return {
      externalId: nexus.item_id,
      externalInstitutionId: nexus.institution_id,
      authToken: accessToken,
    };
  }

  public static serializeBankAccounts(
    accounts: Account[],
    numbers?: PlaidAccountAndRouting[],
  ): BankAccountResponse[] {
    return compact(accounts.map(a => this.serializeBankAccount(a, numbers)));
  }

  public static serializeBankAccount(
    account: Account,
    numbers?: PlaidAccountAndRouting[],
  ): BankAccountResponse {
    const camelizedSubtypeName = capitalize(camelCase(account.subtype));
    const subtypeName = BankAccountSubtype[camelizedSubtypeName as keyof typeof BankAccountSubtype];

    const camelizedTypeName = capitalize(camelCase(account.type));
    const typeName = BankAccountType[camelizedTypeName as keyof typeof BankAccountType];

    if (!this.supportedBankAccountTypes.includes(typeName)) {
      return;
    }

    const accountNumbers = this.findMatchingAccountAndRouting(account.account_id, numbers);

    return {
      bankingDataSource: BankingDataSource.Plaid,
      externalId: account.account_id,
      available: account.balances.available,
      current: account.balances.current,
      lastFour: account.mask,
      nickname: account.name,
      subtype: subtypeName,
      type: typeName,
      account: accountNumbers.account,
      routing: accountNumbers.routing,
    };
  }

  public static serializeTransactions(response: TransactionsResponse): BankTransactionResponse[] {
    return response.transactions.map(transaction => {
      // We negate the transaction amount so that withdrawals
      // are saved as negative amounts and deposits are saved as positive amounts.
      return {
        externalId: transaction.transaction_id,
        pendingExternalId: transaction.pending_transaction_id,
        bankAccountExternalId: transaction.account_id,
        amount: -transaction.amount,
        transactionDate: moment(transaction.date, 'YYYY-MM-DD'),
        pending: transaction.pending,
        externalName: transaction.name,
        address: transaction.location.address,
        city: transaction.location.city,
        state: transaction.location.region,
        zipCode: transaction.location.postal_code && transaction.location.postal_code.slice(0, 5),
        plaidCategory: transaction.category,
        plaidCategoryId: transaction.category_id,
        referenceNumber: transaction.payment_meta.reference_number,
        ppdId: transaction.payment_meta.ppd_id,
        payeeName: transaction.payment_meta.payee,
        metadata: transaction.payment_meta,
      };
    });
  }

  public static serializeError(error: IExtendedPlaidError): BankingDataSourceError {
    const errorType = this.determineErrorType(error.error_code as PlaidErrorCode);
    return new BankingDataSourceError(
      error.error_message,
      BankingDataSource.Plaid,
      error.error_code,
      errorType,
      error,
      error.status_code,
      error.request_id,
    );
  }

  private static determineErrorType(errorCode: PlaidErrorCode): BankingDataSourceErrorType {
    switch (errorCode) {
      case PlaidErrorCode.InvalidCredentials:
      case PlaidErrorCode.InvalidMFA:
      case PlaidErrorCode.NoAccounts:
        return BankingDataSourceErrorType.Disconnected;
      case PlaidErrorCode.ItemLoginRequired:
      case PlaidErrorCode.ItemLocked:
      case PlaidErrorCode.UserSetupRequired:
      case PlaidErrorCode.MFANotSupported:
        return BankingDataSourceErrorType.UserInteractionRequired;

      case PlaidErrorCode.InternalServerError:
        return BankingDataSourceErrorType.InternalServerError;

      case PlaidErrorCode.ItemNoVerification:
      case PlaidErrorCode.IncorrectDepositAmounts:
      case PlaidErrorCode.TooManyVerificationAttempts:
      case PlaidErrorCode.ProductNotReady:
        return BankingDataSourceErrorType.NotateOnly;

      case PlaidErrorCode.InvalidField:
      case PlaidErrorCode.MissingFields:
      case PlaidErrorCode.UnknownFields:
      case PlaidErrorCode.InvalidBody:
      case PlaidErrorCode.InvalidHeaders:
      case PlaidErrorCode.NotFound:
      case PlaidErrorCode.SandboxOnly:
        return BankingDataSourceErrorType.InvalidRequest;

      case PlaidErrorCode.AuthLimit:
      case PlaidErrorCode.IdentityLimit:
      case PlaidErrorCode.ItemGetLimit:
      case PlaidErrorCode.RateLimit:
      case PlaidErrorCode.TransactionsLimit:
      case PlaidErrorCode.BalanceLimit:
        return BankingDataSourceErrorType.RateLimitExceeded;

      case PlaidErrorCode.InstitutionDown:
      case PlaidErrorCode.InstitutionNotResponding:
      case PlaidErrorCode.InstitutionNotAvailable:
        return BankingDataSourceErrorType.InstitutionError;

      case PlaidErrorCode.ItemNotSupported:
      case PlaidErrorCode.InstitutionNoLongerSupported:
        return BankingDataSourceErrorType.NoLongerSupported;
      case PlaidErrorCode.InvalidAccountId:
        return BankingDataSourceErrorType.AccountDeleted;
      default:
        return BankingDataSourceErrorType.NoOp;
    }
  }

  private static findMatchingAccountAndRouting(
    accountId: string,
    numbers: PlaidAccountAndRouting[],
  ): PlaidAccountAndRouting {
    const matchNotFound: PlaidAccountAndRouting = {
      account_id: accountId,
      account: null,
      routing: null,
    };

    if (!numbers) {
      return matchNotFound;
    }

    const match = numbers.filter(num => {
      return num.account_id === accountId;
    });

    if (match.length) {
      return match[0];
    }

    return matchNotFound;
  }
}
