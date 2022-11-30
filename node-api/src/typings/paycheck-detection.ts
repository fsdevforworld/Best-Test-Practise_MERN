import {
  RecurringScheduleParams,
  RecurringTransactionInterval,
  RollDirection,
} from '@dave-inc/wire-typings';
import { DateOnly } from '@dave-inc/time-lib';
import { Moment } from 'moment';

export type Match = {
  observed?: DateOnly;
  predicted: DateOnly;
  diff: number;
};

export type MatchResult = {
  confidence: number;
  matchScore: number;
  percentageOfObserved: number;
  rollDirection: RollDirection;
  interval: RecurringTransactionInterval;
  params: RecurringScheduleParams;
  matchPairs: Match[];
  numMatches: number;
  numPredictions: number;
  unmatched: DateOnly[];
  weeklyStart: Moment;
  paramGrouping?: ParamGrouping;
};

export type ValidationResult = {
  isValid: boolean;
  error?: string;
  customCode?: number;
  data?: any;
};

export type ParamGrouping = {
  items: DateOnly[];
  count: number;
  params: RecurringScheduleParams;
};
