import { BankAccountResponse, BankNexusResponse, BankTransactionResponse } from '../../typings';

import { dogstatsd } from '../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';

import { BankingDataSourceError } from './error';

export abstract class BankingDataSourceIntegration {
  public readonly serializer: any;

  public abstract getAccounts(): Promise<BankAccountResponse[]>;

  public abstract getAccountsWithAccountAndRouting(): Promise<BankAccountResponse[]>;

  public abstract getBalance(accountIds?: string[]): Promise<BankAccountResponse[]>;

  public abstract getNexus(): Promise<BankNexusResponse>;

  public abstract deleteNexus(): Promise<boolean>;

  public abstract getTransactions(
    startDate: string,
    endDate: string,
    accountIds: string[],
    options: { perPage: number; pageNumber: number },
    accumulator?: BankTransactionResponse[],
  ): Promise<BankTransactionResponse[]>;

  public async makeRequest<T>(request: PromiseLike<T>, requestName?: string): Promise<T> {
    let error: BankingDataSourceError;
    const tags = { source: this.constructor.name, request_name: requestName };
    const startTime = moment();

    try {
      dogstatsd.increment('banking_data_source.request_attempted', tags);

      const response = await request;
      dogstatsd.increment('banking_data_source.request_succeeded', tags);
      return response;
    } catch (e) {
      error = e instanceof BankingDataSourceError ? e : this.serializer.serializeError(e);

      dogstatsd.increment('banking_data_source.request_errored', {
        ...error.generateMetricTags(),
        ...tags,
      });
      throw error;
    } finally {
      const timeElapsedMs = moment().diff(startTime, 'ms');

      dogstatsd.increment('banking_data_source.request_time', timeElapsedMs, {
        ...(error ? error.generateMetricTags() : {}),
        ...tags,
        success: error ? 'false' : 'true',
      });
    }
  }
}
