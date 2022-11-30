import {
  MAX_ADVANCE_AMOUNT,
  MAX_STANDARD_ADVANCE_AMOUNT,
  MIN_ACCOUNT_AGE,
  MINIMUM_PAYCHECK_AMOUNT,
  MAX_TINY_MONEY_AMOUNT,
} from '../../src/services/advance-approval/advance-approval-engine/common';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalGetResponse,
  AdvanceApprovalTrigger,
  AdvanceSummary,
  ApprovalBankAccount,
  UserPreQualifyResponse,
} from '../services/advance-approval/types';
import {
  handleCreateApproval,
  handleCreateSingleApproval,
  handleGetApproval,
  handleGetRules,
  handlePreQualifyUser,
  handleUpdateExperiments,
  TRUE_VALUE,
} from '../services/advance-approval/controller';
import * as config from 'config';
import * as request from 'superagent';
import { dogstatsd } from './datadog-statsd';
import { AdvanceRulesResponse } from '@dave-inc/wire-typings';
import logger from './logger';

const { domain, serviceTestRatio } = config.get('advanceApproval');

export type CreateApprovalParams = {
  bankAccountId?: number;
  advanceSummary: AdvanceSummary;
  userTimezone: string;
  userId: number;
  appScreen?: string;
  auditLog?: boolean;
  trigger: AdvanceApprovalTrigger;
  mlUseCacheOnly?: boolean;
  logData?: any;
  useAllBankAccounts?: boolean;
};

export type CreateSingleApprovalParams = {
  bankAccountId: number;
  advanceSummary: AdvanceSummary;
  userTimezone: string;
  userId: number;
  trigger: AdvanceApprovalTrigger;
  recurringTransactionId?: number;
};

export type GetPreQualifyParams = {
  userId: number;
  bankAccount: ApprovalBankAccount;
};

export type GetApprovalParams = {
  bankAccountId: number;
  amount: number;
  recurringTransactionId?: number;
  appScreen?: string;
};

export type GetRulesParams = {
  isDaveBanking: boolean;
};

export type UpdateExperimentsParams = {
  advanceApprovalId: number;
  advanceId: number;
};

function shouldUseService(): boolean {
  return Math.random() < serviceTestRatio;
}

export type Handler<InputType, OutputType> = (data: InputType) => Promise<OutputType>;

function testRequest<T extends object, R>(
  routeName: string,
  endpoint: string,
  requestFunction: (url: string) => request.SuperAgentRequest,
  fallBack: (data: T) => Promise<R>,
): Handler<T, R> {
  return async (data: T) => {
    if (shouldUseService()) {
      try {
        const url = `${domain}/services/advance-approval${endpoint}`;
        const response = await requestFunction(url).send(data);
        dogstatsd.increment('advance_approval_client.request.success', { routeName });

        return response.body;
      } catch (error) {
        logger.error('Error in advance approval client request ' + routeName, { error });
        dogstatsd.increment('advance_approval_client.request.error', { routeName });
      }
    }

    return fallBack(data);
  };
}

const AdvanceApprovalClient = {
  createAdvanceApproval: testRequest<CreateApprovalParams, AdvanceApprovalCreateResponse[]>(
    'create approval',
    '/approval',
    request.post,
    handleCreateApproval,
  ),
  createSingleApproval: (data: CreateSingleApprovalParams) => {
    const endpoint = `/recurring-transaction/${data.recurringTransactionId}/approval`;
    const handler = testRequest<CreateSingleApprovalParams, AdvanceApprovalCreateResponse>(
      'create single approval',
      endpoint,
      request.post,
      handleCreateSingleApproval,
    );
    return handler(data);
  },
  preQualifyUser: testRequest<GetPreQualifyParams, UserPreQualifyResponse>(
    'pre-qualify user',
    '/pre-qualify',
    request.get,
    handlePreQualifyUser,
  ),
  getAdvanceApproval: (data: GetApprovalParams) => {
    let endpont = `/approval?amount=${data.amount}&bankAccountId=${data.bankAccountId}`;
    if (data.recurringTransactionId) {
      endpont += `&recurringTransactionId=${data.recurringTransactionId}`;
    }
    if (data.appScreen) {
      endpont += `&appScreen=${data.appScreen}`;
    }
    const handler = testRequest<GetApprovalParams, AdvanceApprovalGetResponse>(
      'get approval',
      endpont,
      request.get,
      handleGetApproval,
    );
    return handler(data);
  },
  getRules: (data: GetRulesParams) => {
    let endpoint = '/rules';
    if (data.isDaveBanking) {
      endpoint += `?isDaveBanking=${TRUE_VALUE}`;
    }
    const handler = testRequest<GetRulesParams, AdvanceRulesResponse>(
      'get rules',
      endpoint,
      request.get,
      handleGetRules,
    );
    return handler(data);
  },
  updateExperiments: testRequest<UpdateExperimentsParams, void>(
    'update experiments',
    '/experiments',
    request.put,
    handleUpdateExperiments,
  ),
  MAX_ADVANCE_AMOUNT,
  MINIMUM_PAYCHECK_AMOUNT,
  MIN_ACCOUNT_AGE,
  MAX_STANDARD_ADVANCE_AMOUNT,
  MAX_TINY_MONEY_AMOUNT,
};

export default AdvanceApprovalClient;
