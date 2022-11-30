import { RecurringTransactionInterval, RollDirection } from '@dave-inc/wire-typings';
import { DateOnly } from '@dave-inc/time-lib';

export const ROLL_DIRECTIONS: RollDirection[] = [-2, -1, 0, 1, 2];

export const TRANSACTION_SETTLEMENT_DAYS = 3;

export const RSCHED_CONFIDENCE_THRESHOLD = 90;

export const RSCHED_CONFIDENCE_EXPERIMENT_THRESHOLD = 75;
export const RSCHED_MATCH_SCORE_EXPERIMENT_THRESHOLD = 0.75;

export const MINIMUM_INCOME_AMOUNT = 10;

export const MINIMUM_SINGLE_TRANSACTION_INCOME_AMOUNT = 100;

/**
 * Contains data used throughout the paycheck detection flow.
 */
export type PredictionOptions = {
  requireMultipleObservations: boolean;
  today: DateOnly;
  useReadReplica?: boolean;
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
