import * as config from 'config';
import * as request from 'superagent';
import {
  RecurringScheduleParams,
  RecurringTransactionInterval,
  RecurringTransactionStatus,
} from '@dave-inc/wire-typings';
import { moment, Moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { identity, pick } from 'lodash';
import { TransactionType } from '../../typings';
import { ExpectedTransactionStatus } from '../../models/expected-transaction';
import { BankTransaction, QueryFilter } from '@dave-inc/heath-types';
import HeathClient from '../../lib/heath-client';

const { domain } = config.get('recurringTransaction');

export type GetNextExpectedTransactionParams = {
  recurringTransactionId: number;
  after?: Moment;
};

export const MINIMUM_INCOME_AMOUNT = 10;

export type GetIncomeParams = {
  bankAccountId: number;
  userId: number;
  status: RecurringTransactionStatus[];
};

export type ExpectedTransaction = {
  id: number;
  bankAccountId: number;
  userId: number;
  recurringTransactionId: number;
  type: TransactionType;
  displayName: string;
  pendingDisplayName: string;
  expectedAmount: number;
  pendingAmount: number;
  settledAmount: number;
  expectedDate: string;
  pendingDate: string;
  settledDate: string;
  status: ExpectedTransactionStatus;
  groundhogId?: string;
};

/**
 * Rough approximation of days in an interval
 */
export const IntervalDuration: { [key in RecurringTransactionInterval]: number } = {
  [RecurringTransactionInterval.WEEKLY]: 7,
  [RecurringTransactionInterval.BIWEEKLY]: 14,
  [RecurringTransactionInterval.SEMI_MONTHLY]: 15,
  [RecurringTransactionInterval.MONTHLY]: 30,
  [RecurringTransactionInterval.WEEKDAY_MONTHLY]: 30,
};

export enum LookbackPeriod {
  Default = 60,
  EntireHistory = -1,
}

export type RecurringTransaction = {
  id: number;
  bankAccountId: number;
  userId: number;
  transactionDisplayName: string;
  rsched: {
    interval: RecurringTransactionInterval;
    params: RecurringScheduleParams;
  };
  userAmount: number;
  userDisplayName: string;
  pendingDisplayName: string;
  type: TransactionType;
  status: RecurringTransactionStatus;
  missed: string;
  terminated: string;
  groundhogId?: string;
};

async function makeRequest<T extends object, R>(
  routeName: string,
  endpoint: string,
  requestFunction: (url: string) => request.SuperAgentRequest,
): Promise<R> {
  try {
    const url = `${domain}/services/recurring-transaction${endpoint}`;
    const response = await requestFunction(url);
    dogstatsd.increment('advance_approval_client.request.success', { routeName });

    return response.body;
  } catch (error) {
    logger.error('Error in recurring transaction client request ' + routeName, { error });
    dogstatsd.increment('advance_approval_client.request.error', { routeName });
    throw error;
  }
}

const RecurringTransactionClient = {
  getIncomes: (params: {
    bankAccountId: number;
    userId: number;
    status?: RecurringTransactionStatus[];
  }): Promise<RecurringTransaction[]> => {
    return makeRequest(
      'get incomes',
      `/user/${params.userId}/bank-account/${params.bankAccountId}/income`,
      (url: string) => request.get(url).query(pick(params, 'status')),
    );
  },
  getById: (recurringTransactionId: number): Promise<RecurringTransaction> => {
    return makeRequest(
      'get incomes',
      `/recurring-transaction/${recurringTransactionId}`,
      request.get,
    );
  },
  getNextExpectedTransaction: (
    data: GetNextExpectedTransactionParams,
  ): Promise<ExpectedTransaction> => {
    return makeRequest(
      'get incomes',
      `/recurring-transaction/${data.recurringTransactionId}/expected-transaction/next`,
      (url: string) => request.get(url).query({ after: moment(data.after).format() }),
    );
  },
  getMatchingBankTransactions: async (
    recurringTransaction: RecurringTransaction,
    today: Moment = moment(),
    lookbackPeriod: number = LookbackPeriod.Default,
    useReadReplica: boolean = false,
  ): Promise<BankTransaction[]> => {
    const filter: QueryFilter = {
      displayName: {
        in: [
          recurringTransaction.transactionDisplayName,
          recurringTransaction.pendingDisplayName,
          recurringTransaction.userDisplayName,
        ].filter(identity),
      },
    };

    if (lookbackPeriod !== LookbackPeriod.EntireHistory) {
      const start = today.clone().subtract(lookbackPeriod, 'days');
      filter.transactionDate = {
        gte: start.ymd(),
        lte: today.ymd(),
      };
    }

    // We are going to remove some small amounts from incomes
    if (recurringTransaction.userAmount > 0) {
      filter.amount = {
        gt: recurringTransaction.userAmount > MINIMUM_INCOME_AMOUNT ? MINIMUM_INCOME_AMOUNT : 0,
      };
    } else {
      filter.amount = {
        lt: 0,
      };
    }

    return HeathClient.getBankTransactions(recurringTransaction.bankAccountId, filter, {
      useReadReplica,
    });
  },
};

export default RecurringTransactionClient;
