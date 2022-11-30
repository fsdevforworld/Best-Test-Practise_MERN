import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import { metrics, RecurringTransactionMetrics as Metrics } from './metrics';
import { evaluateSchedule, validateMatch } from './detect-recurring-schedule';
import { DateOnly, moment, removeDuplicates } from '@dave-inc/time-lib';
import { isEmpty, meanBy, pick, toInteger } from 'lodash';
import { CUSTOM_ERROR_CODES, InvalidParametersError } from '../../lib/error';
import { Moment } from 'moment';
import { RSched } from '../../lib/recurring-schedule';
import { MatchResult } from '../../typings';
import { PredictionOptions } from './constants';
import { CreateParams, RecurringTransaction, UpdateParams } from './types';
import * as Utils from './utils';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

const CASH_DEPOSIT_NAME_MATCHERS: RegExp[] = [
  /.*Cash Deposit.*/i,
  /.*ATM .*/i,
  /.*MOBILE CHECK DEPOSIT.*/i,
  /.*MOBILE DEPOSIT.*/i,
  /.*TRANSFER.*/i,
  /.*Deposit from Checking.*/i,
  /.*JEANIE DEPOSIT.*/i,
  /.*DEPOSIT REF #.*/i,
  /^DEPOSIT$/i,
  /.*MONEY.*/i,
  /.*Zelle.*/i,
  /.*RETURN ITEM\/OVERDRAFT.*/i,
  /.*Venmo.*/i,
  /.*visa direct.*/i,
  /\bcash app\b/i,
  /.*pmnt rcvd.*/i,
  /.*debit.*/i,
];

const LOAN_DEPOSIT_NAME_MATCHERS: RegExp[] = [
  /.*ACTIVEHOURS.*/i,
  /.* EARNIN .*/i,
  /.*EARNINACTIVE.*/i,
];

export function isLoanDeposit(name: string, averageAmount: number): boolean {
  if (/.*Dave.*/i.test(name) && averageAmount <= AdvanceApprovalClient.MAX_ADVANCE_AMOUNT) {
    return true;
  }
  return LOAN_DEPOSIT_NAME_MATCHERS.some(reg => reg.test(name));
}

export function isCashDeposit(name: string, amount: number) {
  const hasInvalidName = CASH_DEPOSIT_NAME_MATCHERS.some((reg: RegExp) => reg.test(name));

  if (amount > 0 && hasInvalidName) {
    return true;
  }

  return false;
}

export function hasValidDirectDepositName(name: string): boolean {
  const invalidNames = LOAN_DEPOSIT_NAME_MATCHERS.concat(CASH_DEPOSIT_NAME_MATCHERS);
  const hasInvalidName = invalidNames.some((reg: RegExp) => reg.test(name));

  return !hasInvalidName;
}

function recordValidationFailure(type: string | number) {
  return metrics.increment(Metrics.VALIDATION_FAILURE, {
    type: type.toString(),
  });
}

export type PerformValidityCheckOptions = Partial<PredictionOptions>;

export async function performValidityCheck(
  recurringTransaction: RecurringTransaction,
  { requireMultipleObservations = true, useReadReplica = false }: PerformValidityCheckOptions = {},
): Promise<void> {
  const observations = await Utils.getMatchingBankTransactions(
    recurringTransaction,
    moment(),
    90,
    useReadReplica,
  );
  const averageAmount = meanBy(observations, 'amount');
  if (
    recurringTransaction.userAmount > 0 &&
    isLoanDeposit(recurringTransaction.transactionDisplayName, averageAmount)
  ) {
    throw new InvalidParametersError('Incomes of this type are not accepted.', {
      customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_INVALID_INCOME_TYPE,
    });
  }

  if (observations.length < 1) {
    recordValidationFailure('no_transactions');
    throw new InvalidParametersError("I don't see this transaction in your account history.", {
      customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_NOT_FOUND,
    });
  }

  const { userAmount } = recurringTransaction;
  if (requireMultipleObservations && userAmount > 0 && observations.length < 2) {
    recordValidationFailure('only_one_transaction');
    throw new InvalidParametersError('Must have at least 2 matching paychecks', {
      customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_NOT_ENOUGH_MATCHING,
    });
  }

  const transactionDates = observations.map(o => moment(o.transactionDate));
  const withoutDuplicates: Moment[] = removeDuplicates(transactionDates);
  const datesOnly = withoutDuplicates.map(d => DateOnly.fromMoment(d));

  const options = { requireMultipleObservations };
  recursivelyValidateParamsWithObservations(recurringTransaction, datesOnly, options);

  metrics.increment(Metrics.VALIDATION_SUCCESS, { type: recurringTransaction.type });
}

export function recursivelyValidateParamsWithObservations(
  recurringTransaction: RecurringTransaction,
  observedDates: DateOnly[],
  options: Partial<PredictionOptions> = {},
): MatchResult {
  const { today = DateOnly.now() } = options;

  observedDates = observedDates.sort((a, b) => a.compare(b));
  const firstObservation = observedDates[0];
  Utils.updateRSched(recurringTransaction, { dtstart: firstObservation.toMoment() });
  let result = evaluateSchedule(recurringTransaction.rsched, observedDates, today);
  const canRecurse = observedDates.length > 2;

  let validated = validateMatch(result, observedDates, options);

  // No need to recurse if we are missing the most recent one
  if (
    !validated.isValid &&
    validated.customCode === CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_STOPPED_OCCURRING
  ) {
    recordValidationFailure('stopped_occurring');
    throw new InvalidParametersError(validated.error, validated);
  }

  if (!validated.isValid && canRecurse) {
    result = recursivelyValidateParamsWithObservations(
      recurringTransaction,
      observedDates.slice(1),
      options,
    );
    validated = validateMatch(result, observedDates, options);
  }

  if (!validated.isValid) {
    recordValidationFailure(validated.customCode);
    throw new InvalidParametersError(validated.error, validated);
  }

  return result;
}

/**
 * We don't want to accept semi monthly params that are too close together as these are
 * probably bad pay schedules that have snuck past other checks.
 */
export function semiMonthlyParamsAreTooClose(params: Array<string | number>, distance = 7) {
  const tooCloseFirstParam = toInteger(params[1]) + 28 - toInteger(params[0]) < distance;
  const tooCloseSecondParam = toInteger(params[0]) + 28 - toInteger(params[1]) < distance;
  const tooClose = Math.abs(toInteger(params[1]) - toInteger(params[0])) < distance;

  return tooCloseFirstParam || tooCloseSecondParam || tooClose;
}

export function sanitizeUserInput(recParams: CreateParams): CreateParams {
  if (recParams.interval) {
    recParams.interval =
      RecurringTransactionInterval[
        recParams.interval.toUpperCase() as keyof typeof RecurringTransactionInterval
      ];
  }
  if (
    recParams.interval === RecurringTransactionInterval.MONTHLY ||
    recParams.interval === RecurringTransactionInterval.SEMI_MONTHLY
  ) {
    recParams.params = recParams.params.map((param: number | string) => {
      if (param > 28) {
        return -1;
      } else if (param < -1) {
        throw new InvalidParametersError('Monthly Params cannot be less than -1');
      }
      return param;
    });
    if (
      recParams.interval === RecurringTransactionInterval.SEMI_MONTHLY &&
      semiMonthlyParamsAreTooClose(recParams.params)
    ) {
      throw new InvalidParametersError('Semi Monthly Params must be at least 7 days apart.');
    }
  }

  return recParams;
}

const SCHEDULE_PARAMS = ['interval', 'params', 'rollDirection'];

export function hasScheduleParams(params: CreateParams): boolean {
  return !isEmpty(pick(params, SCHEDULE_PARAMS));
}

export async function sanitizeUpdateParams(
  transaction: RecurringTransaction,
  params: UpdateParams,
): Promise<UpdateParams> {
  if (hasScheduleParams(params)) {
    const cleanedParams = sanitizeUserInput(params);

    const interval = cleanedParams.interval || transaction.rsched.interval;
    const schedParams = cleanedParams.params || transaction.rsched.params;
    const rollDirection = cleanedParams.rollDirection || transaction.rsched.rollDirection;

    // Using RSched constructor because it validates interval/params and throws if they're invalid
    RSched.validateRschedParams(interval, schedParams, rollDirection);

    // Updates dtstart for biweekly intervals
    if (interval === RecurringTransactionInterval.BIWEEKLY) {
      const observations = await Utils.getMatchingBankTransactions(transaction);

      if (observations.length < 1) {
        cleanedParams.dtstart = moment();
      } else {
        cleanedParams.dtstart = moment(observations[0].transactionDate);
      }
    }

    return cleanedParams;
  } else {
    return params;
  }
}
