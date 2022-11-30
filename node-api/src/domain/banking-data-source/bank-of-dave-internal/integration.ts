import * as openapi from '@dave-inc/banking-internal-api-client';
import { BankingDataSource as BankingDataSourceType } from '@dave-inc/wire-typings';
import { AxiosResponse } from 'axios';
import * as Bluebird from 'bluebird';
import { isNil } from 'lodash';
import { dateInTimezone, DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import { BankAccountResponse, BankNexusResponse, BankTransactionResponse } from '../../../typings';
import getClient from '../../bank-of-dave-internal-api';
import { BankingDataSourceIntegration } from '../integration-interface';
import { BankOfDaveInternalApiDataSerializer } from './data-serializer';

const INTERNAL_API_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export default class BankOfDaveInternalApiIntegration extends BankingDataSourceIntegration {
  public readonly serializer: BankOfDaveInternalApiDataSerializer;

  private client: openapi.V1Api;

  public constructor(private daveUserID: number, private userUuid: string) {
    super();

    this.client = getClient();
    this.serializer = new BankOfDaveInternalApiDataSerializer();
  }

  public getAccounts(): Promise<BankAccountResponse[]> {
    return this.getAccountResponse();
  }

  public async getAccountsWithAccountAndRouting(): Promise<BankAccountResponse[]> {
    return this.getAccountResponse();
  }
  public async getBalance(accountIds?: string[]): Promise<BankAccountResponse[]> {
    const accounts = await this.getAccountResponse();
    if (accountIds) {
      return accounts.filter(account => accountIds.includes(account.externalId));
    }

    return accounts;
  }

  public async getNexus(): Promise<BankNexusResponse> {
    return {
      authToken: this.userUuid,
      externalId: this.userUuid,
      externalInstitutionId: BankingDataSourceType.BankOfDave,
    };
  }

  public async deleteNexus(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public async getTransactions(
    startDate: string,
    endDate: string,
    accountIds: string[],
    options: { perPage: number; pageNumber: number },
    accumulator?: BankTransactionResponse[],
  ): Promise<BankTransactionResponse[]> {
    const startDateTime = dateInTimezone(startDate, DEFAULT_TIMEZONE)
      .utc()
      .format(INTERNAL_API_DATE_FORMAT);
    const endDateTime = dateInTimezone(endDate, DEFAULT_TIMEZONE)
      .endOf('day')
      .utc()
      .format(INTERNAL_API_DATE_FORMAT);
    const results = await Bluebird.map(accountIds, async accountId =>
      this.getTransactionsForAccount(startDateTime, endDateTime, accountId, {
        perPage: options.perPage,
        pageNumber: options.pageNumber + 1,
      }),
    );
    return results.reduce((a, b) => a.concat(b), []);
  }

  private async getAccountResponse(): Promise<BankAccountResponse[]> {
    const response = await this.makeRequest<
      AxiosResponse<openapi.IInternalApiBankAccountsResponse>
    >(this.client.getUserBankAccounts(this.daveUserID));
    return response.data.bankAccounts.map(this.serializer.serializeBankAccount);
  }

  private async getTransactionsForAccount(
    startDateTime: string,
    endDateTime: string,
    accountId: string,
    options: { perPage: number; pageNumber: number },
    accumulator?: BankTransactionResponse[],
  ): Promise<BankTransactionResponse[]> {
    const response = await this.makeRequest<
      AxiosResponse<openapi.IInternalApiTransactionsResponse>
    >(
      this.client.getBankAccountTransactions(
        accountId,
        startDateTime,
        endDateTime,
        options.pageNumber,
        options.perPage,
      ),
    );
    const serialized = this.serializer.serializeTransactions(accountId, response.data);
    accumulator = isNil(accumulator) ? serialized : accumulator.concat(serialized);

    if (this.keepFetching(serialized.length)) {
      const nextPage = options.pageNumber + 1;
      const nextPageOptions = { ...options, pageNumber: nextPage };
      return this.getTransactionsForAccount(
        startDateTime,
        endDateTime,
        accountId,
        nextPageOptions,
        accumulator,
      );
    } else {
      return accumulator;
    }
  }

  private keepFetching(serializedLength: number): boolean {
    const stillTransactionsInResponse = serializedLength !== 0;
    return stillTransactionsInResponse;
  }
}
