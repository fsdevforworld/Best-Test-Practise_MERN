import { action } from 'typesafe-actions';

import {
  PossibleRecurringTransactionResponse,
  RecurringTransactionResponse,
  RecurringTransactionInterval,
  RecurringScheduleParams,
  RollDirection,
} from '@dave-inc/wire-typings';

import { APIClientAction, APIError } from 'store/api-client-middleware';

/**
 * Detect Paychecks
 */
export const detectPaychecksLoad = () => action('DETECT_PAYCHECKS_LOAD');
export const detectPaychecksSuccess = (response: PossibleRecurringTransactionResponse[]) =>
  action('DETECT_PAYCHECKS_SUCCESS', response);
export const detectPaychecksFail = (err: APIError) => action('DETECT_PAYCHECKS_FAIL', err);

export type DetectPaychecksType = (
  bankConnectionId: number,
) => Promise<PossibleRecurringTransactionResponse[]>;

export function detectPaychecks(
  bankAccountId: number,
): APIClientAction<PossibleRecurringTransactionResponse[]> {
  return {
    actions: [detectPaychecksLoad, detectPaychecksSuccess, detectPaychecksFail],
    promise: (client) => client.get(`/v2/bank_account/${bankAccountId}/paychecks`),
  };
}

/**
 * Submit Recurring Income
 */
export const submitRecurringIncomeLoad = () => action('REC_INCOME_SUBMIT');
export const submitRecurringIncomeSuccess = (response: RecurringTransactionResponse) =>
  action('REC_INCOME_SUBMIT_SUCCESS', response);
export const submitRecurringIncomeFail = (err: APIError) => action('REC_INCOME_SUBMIT_FAIL', err);

type SubmitRecurringIncomeProps = {
  bankAccountId: number;
  interval: RecurringTransactionInterval | undefined;
  params: RecurringScheduleParams | undefined;
  bankTransactionId?: number;
  rollDirection?: RollDirection;
  userAmount?: number;
  userDisplayName?: string;
};

export type SubmitRecurringIncomeType = (
  props: SubmitRecurringIncomeProps,
) => Promise<RecurringTransactionResponse>;

export function submitRecurringIncome({
  bankAccountId,
  ...data
}: SubmitRecurringIncomeProps): APIClientAction<RecurringTransactionResponse> {
  return {
    actions: [submitRecurringIncomeLoad, submitRecurringIncomeSuccess, submitRecurringIncomeFail],
    promise: (client) =>
      client.post(`/v2/bank_account/${bankAccountId}/recurring_income`, { data }),
  };
}
