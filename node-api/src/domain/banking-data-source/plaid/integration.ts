import { BankingDataSourceIntegration } from '../integration-interface';
import {
  BankAccountResponse,
  BankingDataSourceErrorType,
  BankNexusResponse,
  BankTransactionResponse,
  PlaidErrorCode,
} from '../../../typings';
import { AuthResponse, BaseResponse } from 'plaid';
import plaidClient from '../../../lib/plaid';
import { retry } from '../../../lib/utils';
import { PlaidDataSerializer } from './data-serializer';
import { AccountsResponse, ItemRemoveResponse, ItemResponse, TransactionsResponse } from 'plaid';
import * as Limiter from './limiter';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { BankingDataSourceError } from '../error';
import { BankingDataSource } from '@dave-inc/wire-typings';
import logger from '../../../lib/logger';

export default class PlaidIntegration extends BankingDataSourceIntegration {
  public readonly serializer = PlaidDataSerializer;
  protected readonly client = plaidClient;
  protected readonly token: string;

  public constructor(token: string) {
    super();

    this.token = token;
  }

  public async createNexus(): Promise<BankNexusResponse> {
    const request = this.client.exchangePublicToken(this.token);
    const tokenResponse = await this.makeRequest(request);

    return {
      externalId: tokenResponse.item_id,
      authToken: tokenResponse.access_token,
    };
  }

  public async getNexus() {
    const request = this.client.getItem(this.token);
    const response = await this.makeRequest<ItemResponse>(request, 'get_nexus');
    const serialized = this.serializer.serializeNexus(this.token, response.item);
    return serialized;
  }

  public async getAccounts(): Promise<BankAccountResponse[]> {
    const request = this.client.getAccounts(this.token);
    const response = await this.makeRequest<AccountsResponse>(request, 'get_accounts');
    const serialized = this.serializer.serializeBankAccounts(response.accounts);
    return serialized;
  }

  public async getItem(): Promise<ItemResponse> {
    const request = this.client.getItem(this.token);
    return this.makeRequest<ItemResponse>(request, 'get_item');
  }

  public async refreshTransactions(): Promise<BaseResponse> {
    const request = this.client.refreshTransactions(this.token);
    return this.makeRequest<BaseResponse>(request, 'refresh_transactions');
  }

  public async getAccountsWithAccountAndRouting(): Promise<BankAccountResponse[]> {
    const request: Promise<AuthResponse> = this.client.getAuth(this.token);
    let response;
    try {
      response = await this.makeRequest(request, 'get_accounts_with_account_and_routing');
    } catch (error) {
      logger.error('Error: get_accounts_with_account_and_routing', { error });
      throw error;
    }
    const serialized = this.serializer.serializeBankAccounts(
      response.accounts,
      response.numbers.ach,
    );
    return serialized;
  }

  public async getBalance(accountIds?: string[]): Promise<BankAccountResponse[]> {
    const hitRateLimit = await Limiter.checkRateLimitAndWait(120);
    if (hitRateLimit) {
      dogstatsd.increment('plaid.get_balance.rate_limit.max_wait');
      throw new BankingDataSourceError(
        'Hit plaid balance get rate limit after 120s',
        BankingDataSource.Plaid,
        PlaidErrorCode.RateLimit,
        BankingDataSourceErrorType.RateLimitExceeded,
        null,
      );
    }
    const request = this.client.getBalance(this.token, { account_ids: accountIds });
    const response = await this.makeRequest<AccountsResponse>(request, 'get_balance');
    const serialized = this.serializer.serializeBankAccounts(response.accounts);
    return serialized;
  }

  public async getTransactions(
    startDate: string,
    endDate: string,
    accountIds: string[],
    options: { perPage: number; pageNumber: number },
    accumulator: BankTransactionResponse[] = [],
  ): Promise<BankTransactionResponse[]> {
    const request = this.client.getTransactions(this.token, startDate, endDate, {
      count: options.perPage,
      offset: options.perPage * options.pageNumber,
      account_ids: accountIds,
    });

    const response = await retry(() =>
      this.makeRequest<TransactionsResponse>(request, 'get_transactions'),
    );
    const serialized = this.serializer.serializeTransactions(response);

    accumulator = accumulator.concat(serialized);

    if (
      this.keepFetching(
        response.total_transactions,
        accumulator.length,
        response.transactions.length > 0,
      )
    ) {
      const nextPage = options.pageNumber + 1;
      const nextPageOptions = { ...options, pageNumber: nextPage };
      return this.getTransactions(startDate, endDate, accountIds, nextPageOptions, accumulator);
    } else {
      return accumulator;
    }
  }

  public async deleteNexus(): Promise<boolean> {
    const request = this.client.removeItem(this.token);
    const response = await this.makeRequest<ItemRemoveResponse>(request, 'delete_nexus');
    return response.removed;
  }

  private keepFetching(
    countExpected: number,
    countFetched: number,
    responseContainsTransactions: boolean,
  ): boolean {
    const receivedFewerThanExpected = countFetched < countExpected;
    return receivedFewerThanExpected && responseContainsTransactions;
  }
}
