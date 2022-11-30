// tslint:disable-next-line:no-require-imports
import skmeans = require('skmeans');
import { Moment, DateOnly, getClosest } from '@dave-inc/time-lib';
import { flatMap, groupBy, isNil, map, orderBy, reduce, size, uniq } from 'lodash';
import {
  Match,
  MatchResult,
  MonthlyParams,
  ParamGrouping,
  ValidationResult,
  WeekdayMonthlyParams,
  WeeklyParams,
} from '../../typings';
import { RSched } from '../../lib/recurring-schedule';
import { semiMonthlyParamsAreTooClose } from './validate-recurring-transaction';
import { CUSTOM_ERROR_CODES } from '../../lib/error';
import { metrics, RecurringTransactionMetrics as Metrics } from './metrics';
import {
  RecurringScheduleParams,
  RecurringTransactionInterval,
  RollDirection,
} from '@dave-inc/wire-typings';
import { PredictionOptions, ROLL_DIRECTIONS } from './constants';

// constants
const { MONTHLY, SEMI_MONTHLY, BIWEEKLY, WEEKLY, WEEKDAY_MONTHLY } = RecurringTransactionInterval;
const MIN_INCOME_PREDICTION_CONFIDENCE_PERCENT = 75;
const SEARCH_FUZZINESS = 3;
const MAX_NO_RESULT_SEARCH_DEPTH = 6;

// We want weekly schedules to get picked before monthly
const SCHEDULE_RANK = {
  [RecurringTransactionInterval.WEEKLY]: 0,
  [RecurringTransactionInterval.BIWEEKLY]: 0,
  [RecurringTransactionInterval.MONTHLY]: 1,
  [RecurringTransactionInterval.SEMI_MONTHLY]: 1,
  [RecurringTransactionInterval.WEEKDAY_MONTHLY]: 2,
};
// Ranking is determined by index with 0 index being the best.
const ROLL_DIRECTION_RANK: RollDirection[] = [-1, 0, 1, -2, 2];

export const MOST_LIKELY_PARAM_GETTERS = {
  [RecurringTransactionInterval.MONTHLY]: _getMostLikelyMonthlyDays,
  [RecurringTransactionInterval.SEMI_MONTHLY]: _getMostLikelySemiMonthlyDays,
  [RecurringTransactionInterval.WEEKDAY_MONTHLY]: _getMostLikelyWeekdayMonthly,
  [RecurringTransactionInterval.WEEKLY]: _getMostLikelyWeekDays,
  [RecurringTransactionInterval.BIWEEKLY]: _getMostLikelyWeekDays,
};

/**
 * Removes duplicates and runs getBestPossibleSchedules, returning only the winner.
 *
 * @param {moment.Moment[]} dates
 * @param {moment.Moment} today for backtesting and tests
 * @returns {MatchResult}
 */
export function getBestScheduleMatch(
  dates: Moment[],
  { requireMultipleObservations = true, today = DateOnly.now() }: Partial<PredictionOptions> = {},
): MatchResult {
  const options = { requireMultipleObservations, today };
  dates = removeDuplicateDates(dates);
  const all = getBestPossibleSchedules(
    dates.map(d => DateOnly.fromMoment(d)),
    today,
    options,
  );
  const [best] = all;
  if (best) {
    metrics.increment(Metrics.RECURRING_SCHEDULE_MATCH_FOUND, {
      interval: best.interval,
    });
  }
  return best;
}

type IntervalCombination = {
  interval: RecurringTransactionInterval;
  rollDirections: RollDirection[];
  paramGroupings?: ParamGrouping[];
};

/**
 * For each type of interval (MONTHLY, WEEKLY...) find the most likely candidates for each,
 * then generate predictions within the given window of dates, then get the exactConfidence of those predictions.
 * Then we remove some of the dates from the beginning and retry in order to handle schedule changes. Then
 * sort the results and filter out failures.
 *
 * @param {moment.Moment[]} dates
 * @param {IntervalCombination[]} intervalChoices for backtesting and tests
 * @param {number} take for backtesting and tests
 * @param {boolean} canStopIfNoneFound boolean if true and no results are found stop iterating
 * @param {RSchedGenerationCache} rschedCache cache for recurring schedule generation
 * @param {moment.Moment} today for backtesting and tests
 * @returns {MatchResult[]} A list of match results sorted by highest exactConfidence.
 */
function getBestPossibleSchedules(
  dates: DateOnly[],
  today: DateOnly,
  options: PredictionOptions,
  intervalChoices: IntervalCombination[] = getPossibleIntervalCombinations(),
  take: number = 3,
  canStopIfNoneFound: boolean = false,
  rschedCache?: RSchedGenerationCache,
): MatchResult[] {
  if (!rschedCache) {
    rschedCache = {
      minDate: dates[0].clone().addDays(-SEARCH_FUZZINESS),
      cachedSchedules: {},
    };
  }

  const evalDates = dates.slice(-take);

  const result: MatchResult[] = reduce<MatchResult[], MatchResult[]>(
    intervalChoices.map(({ interval, rollDirections, paramGroupings }) => {
      const func = paramGroupings ? () => paramGroupings : MOST_LIKELY_PARAM_GETTERS[interval];
      return getAllMatchResults(evalDates, func, interval, today, rollDirections, rschedCache);
    }),
    (a: MatchResult[], b: MatchResult[]) => a.concat(b),
    [],
  );

  const validResults = result.filter(match => validateMatch(match, dates, options).isValid);

  const onlyOneMatch = validResults.length === 1;
  const canStop = (canStopIfNoneFound && validResults.length === 0) || onlyOneMatch;
  if (canStop) {
    return validResults;
  } else if (take < dates.length) {
    intervalChoices = getIntervalCombinationsFromMatches(validResults);

    canStopIfNoneFound =
      canStopIfNoneFound || validResults.length > 0 || take >= MAX_NO_RESULT_SEARCH_DEPTH;

    const nextIterationResults = getBestPossibleSchedules(
      dates,
      today,
      options,
      intervalChoices,
      !canStopIfNoneFound ? take + 1 : take * 2,
      canStopIfNoneFound,
    );
    validResults.push(...nextIterationResults);
  }

  return validResults.sort(_matchResultSorter);
}

function getPossibleIntervalCombinations() {
  const intervals = [MONTHLY, SEMI_MONTHLY, WEEKDAY_MONTHLY, WEEKLY, BIWEEKLY];
  return intervals.map(interval => {
    return { interval, rollDirections: ROLL_DIRECTIONS };
  });
}

function getIntervalCombinationsFromMatches(matches: MatchResult[]) {
  if (!matches.length) {
    return;
  }

  const groupedByInterval = groupBy(matches, res => res.interval);

  return map(groupedByInterval, (matchGroup, interval: RecurringTransactionInterval) => {
    const rollDirections = uniq(matchGroup.map(m => m.rollDirection));
    return { interval, rollDirections };
  });
}

export function validateMatch(
  match: MatchResult,
  observedDates: DateOnly[],
  { requireMultipleObservations = true }: Partial<PredictionOptions> = {},
): ValidationResult {
  const rules: Array<(match: MatchResult) => ValidationResult> = [
    shouldMatchMoreThan50PercentObserved,
    shouldHaveAnAcceptableConfidence,
    (thisMatch: MatchResult) =>
      shouldPredict3IfMoreThan3Total(thisMatch, observedDates.length, requireMultipleObservations),
    (thisMatch: MatchResult) => shouldNotHaveMissedMostRecentTransaction(thisMatch, observedDates),
  ];

  const firstFailure = rules
    .map(rule => rule(match))
    .find((ruleResult: ValidationResult) => !ruleResult.isValid);

  return firstFailure || { isValid: true };
}

// validation functions
const shouldMatchMoreThan50PercentObserved = (match: MatchResult): ValidationResult => {
  if (match.percentageOfObserved <= 50) {
    return {
      isValid: false,
      error: "I'm seeing a different schedule for this transaction, please try again.",
      customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_TOO_MANY_OBSERVED,
    };
  }

  return { isValid: true };
};

/**
 * If we have more than 3 total observations then we should not go below 3 total predictions.
 * This is due to the fact that it is really easy to match on only 2 observations as semi monthly schedule
 * can match any month day.
 *
 * @param {MatchResult} match
 * param {number} total
 */
const shouldPredict3IfMoreThan3Total = (
  match: MatchResult,
  totalObservations: number,
  requireMultipleObservations: boolean,
): ValidationResult => {
  const requiredMatches = requireMultipleObservations ? 2 : 1;

  if ((totalObservations < 4 && match.numMatches >= requiredMatches) || match.numPredictions > 2) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: "I'm seeing a different schedule for this transaction, please try again.",
    customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_FAILED_EXPECTED_SCORE,
  };
};

const shouldHaveAnAcceptableConfidence = (match: MatchResult): ValidationResult => {
  if (match.confidence >= MIN_INCOME_PREDICTION_CONFIDENCE_PERCENT) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: "I'm seeing a different schedule for this transaction, please try again.",
    customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_FAILED_EXPECTED_SCORE,
  };
};

const shouldNotHaveMissedMostRecentTransaction = (
  match: MatchResult,
  observedDates: DateOnly[],
): ValidationResult => {
  const lastPredicted = match.matchPairs[match.matchPairs.length - 1];
  // if the most recent is matched we're good
  if (!lastPredicted || lastPredicted.observed) {
    return { isValid: true };
  }

  const mostRecentTransaction = observedDates[observedDates.length - 1];
  // if we have a recent transaction that doesnt match lets let it in.
  if (mostRecentTransaction && mostRecentTransaction.isAfter(lastPredicted.predicted)) {
    return { isValid: true };
  }

  return {
    isValid: false,
    error: `I don't see this transaction after ${mostRecentTransaction
      .toMoment()
      .format('MMMM DD')}`,
    customCode: CUSTOM_ERROR_CODES.RECURRING_TRANSACTION_STOPPED_OCCURRING,
    data: { lastExpected: lastPredicted.predicted.toString() },
  };
};

// helpers
const getFuzzinessScore = (diff: number) => {
  return (SEARCH_FUZZINESS + 1 - diff) / (SEARCH_FUZZINESS + 1);
};

const weekdayMonthlyParam = (x: DateOnly): WeekdayMonthlyParams => {
  return [Math.ceil(x.date / 7), x.getWeekdayName()];
};

const monthlyParamSort = (day1: number, day2: number) => {
  day1 = day1 === -1 ? 30 : day1;
  day2 = day2 === -1 ? 30 : day2;
  return day1 - day2;
};

export const monthlyParam = (x: DateOnly): MonthlyParams => {
  if (x.date > 28 || (x.month === 1 && x.date === 28)) {
    return [-1];
  }
  return [x.date];
};

const weeklyParam: (x: DateOnly) => WeeklyParams = x => [x.getWeekdayName()];

function getAllMatchResults(
  dates: DateOnly[],
  getBestOptionsFunc: (dates: DateOnly[]) => ParamGrouping[],
  interval: RecurringTransactionInterval,
  today: DateOnly,
  rollDirections: RollDirection[] = ROLL_DIRECTIONS,
  rschedCache?: RSchedGenerationCache,
): MatchResult[] {
  const params = getBestOptionsFunc(dates);
  return flatMap(params, param => {
    const results = _evaluateWithRollDirections(
      interval,
      param.params,
      dates,
      today,
      rollDirections,
      rschedCache,
    );
    return results.map(matchResult => ({ ...matchResult, paramGrouping: param }));
  });
}

/**
 * Takes a function to get params and then groups the dates by params and orders by the most common params.
 *
 * @param {moment.Moment[]} dates
 * @param {(m: Moment) => T} getParams
 * @param {number} take Limit the results to the number of take.
 * @returns {Array<ParamGrouping<T>>}
 */
function groupAndOrderByParams(
  dates: DateOnly[],
  getParams: (m: DateOnly) => RecurringScheduleParams,
  take: number = 3,
): ParamGrouping[] {
  const result = reduce(
    dates,
    (results, date) => {
      const params = getParams(date);
      const exists = results[params.toString()];
      if (exists) {
        exists.count += 1;
        exists.items.push(date);
      } else {
        results[params.toString()] = { count: 1, items: [date], params };
      }
      return results;
    },
    {} as { [key: string]: ParamGrouping },
  );
  const res = orderBy(result, ['count'], ['desc']).slice(0, take);

  return res;
}

function _getMostLikelyMonthlyDays(dates: DateOnly[], take?: number): ParamGrouping[] {
  return groupAndOrderByParams(dates, monthlyParam, take);
}

function _getMostLikelyWeekDays(dates: DateOnly[]): ParamGrouping[] {
  return groupAndOrderByParams(dates, weeklyParam);
}

function _getMostLikelyWeekdayMonthly(dates: DateOnly[]): ParamGrouping[] {
  return groupAndOrderByParams(dates, weekdayMonthlyParam).filter(param => param.params[0] < 5);
}

function _getMostLikelySemiMonthlyDays(dates: DateOnly[]): ParamGrouping[] {
  // we are going to turn all the dates into (x, y) coordinates of a circle in order
  // to properly calculate distances
  const maxDays = 29;
  const radiansPerDay = (Math.PI * 2) / maxDays;
  const variableLastDayFix = dates.map(x => {
    return {
      date: x.date > 28 ? 29 : x.date,
      fullDate: x,
    };
  });
  const grouped = groupBy(variableLastDayFix, dayObj => dayObj.date);
  // If we only have one type of day then we cant cluster them
  if (size(grouped) <= 1) {
    return [];
  }

  let firstDateOptions: ParamGrouping[] = [];
  let secondDateOptions: ParamGrouping[] = [];

  if (size(grouped) === 2) {
    // Skip clustering if only two options, skmeans fails
    // ~40% of the time with only two distinct data points using
    // random initialization, and fails 100% of the time with only
    // two data points using kmeans++ initialization
    const vals = Object.keys(grouped);
    const group0 = grouped[vals[0]];
    const group1 = grouped[vals[1]];
    firstDateOptions = _getMostLikelyMonthlyDays(group0.map(dayObj => dayObj.fullDate));
    secondDateOptions = _getMostLikelyMonthlyDays(group1.map(dayObj => dayObj.fullDate));
  } else {
    const points = variableLastDayFix.map(dayObj => [
      Math.cos(radiansPerDay * dayObj.date),
      Math.sin(radiansPerDay * dayObj.date),
    ]);

    // Kmeans tries to group the dates into two groups centered around 2 means.
    const res = skmeans(points, 2, 'kmpp');

    // get the dates and then group by most common date in each category
    const sectionOneDates: DateOnly[] = [];
    const sectionTwoDates: DateOnly[] = [];
    res.idxs.map((id: number, index: number) => {
      const date = dates[index];
      if (id === 0) {
        sectionOneDates.push(date);
      } else {
        sectionTwoDates.push(date);
      }
    });

    firstDateOptions = _getMostLikelyMonthlyDays(sectionOneDates);
    secondDateOptions = _getMostLikelyMonthlyDays(sectionTwoDates);
  }

  // This creates a matrix of possible semi monthly params. EX. if kmeans gives us [1,2,3] as options for param1
  // and [10,11,12] as options for param 2. this returns [[1,10],[1,11],[1,12],[2,10]...,[3,12]]
  const options = firstDateOptions.reduce((acc: ParamGrouping[], paramGrouping) => {
    const joined = secondDateOptions.map(pg => {
      return {
        params: pg.params.concat(paramGrouping.params).sort(monthlyParamSort),
        count: pg.count + paramGrouping.count,
        items: pg.items.concat(paramGrouping.items),
      };
    });
    return acc.concat(joined);
  }, []);
  const sorted = orderBy(options, ['count'], ['desc']);

  // we're gonna filter out options that are less than 7 days apart as semi monthly pay schedules are
  // not less than 7 days apart
  return sorted.filter(({ params }) => !semiMonthlyParamsAreTooClose(params));
}

const removeDuplicateDates = (dates: Moment[]) => {
  dates = dates.sort((a, b) => a.diff(b));
  return dates.reduce((all, curr) => {
    if (all.length === 0) {
      return [curr];
    } else if (all[all.length - 1].isSame(curr, 'day')) {
      return all;
    } else {
      return all.concat(curr);
    }
  }, []);
};

/**
 * Get the closest allowable date match for when we match predicted to expected dates.
 * @param {moment.Moment} searchDate
 * @param {moment.Moment[]} dates
 * @returns {moment.Moment}
 */
function getClosestAllowableMatch(searchDate: DateOnly, dates: DateOnly[]): DateOnly {
  const match = getClosest(dates, searchDate);
  if (match && Math.abs(match.compare(searchDate)) <= 3) {
    return match;
  }

  return null;
}

// the good stuff

/**
 * Checks the predicted dates against the observed dates. Returns exactConfidence and all values needed to
 * create the recurring transaction.
 *
 * @param {Moment[]} predictedDates
 * @param {Moment[]} observedDates
 * @param {RSched} rsched
 * @returns {MatchResult}
 */
export function evaluatePredictions(
  predictedDates: DateOnly[],
  observedDates: DateOnly[],
  rsched: RSched,
): MatchResult {
  let fuzzinessScore = 0;
  let unmatched = [...observedDates];
  let numMatches = 0;
  const matchPairs = predictedDates.map(predicted => {
    const match = getClosestAllowableMatch(predicted, unmatched);
    if (match) {
      numMatches += 1;
      const diff = Math.abs(match.compare(predicted));
      fuzzinessScore += getFuzzinessScore(diff);
      unmatched = unmatched.filter(x => x !== match);
      return { predicted, observed: match, diff };
    } else {
      return { predicted, diff: -1 };
    }
  });
  const total = predictedDates.length;
  const weeklyStart = matchPairs
    .filter(match => match.observed !== null)
    .map(match => match.observed)[0];
  return {
    confidence: Math.ceil((fuzzinessScore * 100) / total),
    matchScore: _getScoreV2(matchPairs, unmatched),
    percentageOfObserved: Math.ceil((numMatches * 100) / observedDates.length),
    rollDirection: rsched.rollDirection,
    interval: rsched.interval,
    params: rsched.params,
    unmatched,
    numMatches,
    matchPairs,
    numPredictions: predictedDates.length,
    weeklyStart: weeklyStart ? weeklyStart.toMoment() : null,
  };
}

export type RSchedGenerationCache = {
  minDate: DateOnly;
  cachedSchedules: {
    [key: string]: DateOnly[];
  };
};

export function evaluateSchedule(
  rsched: RSched,
  observedDates: DateOnly[],
  today: DateOnly,
  rschedCache?: RSchedGenerationCache,
): MatchResult {
  // assert sorted TODO this is not great but it'll do
  if (observedDates[0] && observedDates[0].isAfter(observedDates[observedDates.length - 1])) {
    throw new Error('Evaluate schedule should only accept a sorted list');
  }

  const minDate = observedDates[0].clone().addDays(-SEARCH_FUZZINESS);
  let predictedDates: DateOnly[] = [];

  // If the transaction came in today, and today is earlier then predicted
  const lastObserved = observedDates[observedDates.length - 1];
  if (
    lastObserved
      .clone()
      .addDays(3)
      .isAfter(today)
  ) {
    today = lastObserved.clone().addDays(3);
  }

  // This gives us a significant performance boost when detecting schedules.
  if (rschedCache) {
    const cached = rschedCache.cachedSchedules[rsched.id];
    predictedDates = cached || rsched.between(rschedCache.minDate, today, true);
    rschedCache.cachedSchedules[rsched.id] = predictedDates;
    predictedDates = predictedDates.filter(p => p.isAfter(minDate, true));
  } else {
    predictedDates = rsched.between(minDate, today, true);
  }

  const predictedWithoutToday = _filterOrKeepLastPrediction(predictedDates, observedDates, today);
  return evaluatePredictions(predictedWithoutToday, observedDates, rsched);
}

/**
 * We should let a transaction come in a day late, so if a prediction was supposed to occur today and
 * did not then we shouldn't penalize it, but if it was supposed to come in today
 * and did then we should use it
 *
 * @param {moment.Moment[]} predictedDates
 * @param {moment.Moment[]} observedDates
 * @param {moment.Moment} today
 * @returns {moment.Moment[]}
 */
function _filterOrKeepLastPrediction(
  predictedDates: DateOnly[],
  observedDates: DateOnly[],
  today: DateOnly,
) {
  const latest = predictedDates[predictedDates.length - 1];
  if (latest && latest.isEqual(today)) {
    const match = getClosestAllowableMatch(latest, observedDates);
    if (!match) {
      return predictedDates.slice(0, -1);
    }
  }

  return predictedDates;
}

/**
 * Runs evaluate on the observed dates with the provided roll directions in order to find the best one.
 *
 *
 * @param {RecurringTransactionInterval} interval
 * @param {RecurringScheduleParams} params
 * @param {moment.Moment[]} observedDates
 * @param {moment.Moment} today
 * @param {RollDirection[]} rollDirections
 * @param {RSchedGenerationCache} rschedCache
 * @returns {MatchResult[]}
 */
export function _evaluateWithRollDirections(
  interval: RecurringTransactionInterval,
  params: RecurringScheduleParams,
  observedDates: DateOnly[],
  today: DateOnly,
  rollDirections: RollDirection[] = ROLL_DIRECTIONS,
  rschedCache?: RSchedGenerationCache,
): MatchResult[] {
  const rsched = new RSched(interval, params, 0, observedDates[0]);
  return rollDirections.map(direction => {
    rsched.rollDirection = direction;
    return evaluateSchedule(rsched, observedDates, today, rschedCache);
  });
}

/**
 * Gets a score for the current match, takes into account length of matches, and weights misses that happen
 * later ( like not matching the last 2 transactions ) more than misses that happen earlier. Also takes
 * into account the accuracy of each prediction.
 *
 * @param {moment.Moment[]} matchResult
 * @param maxLen The max length of the
 */
export function _getScore(matchResult: MatchResult, maxLen: number): number {
  // the exponential component used to weight transactions closer to the end as more important
  // such that a unmatched date at the nth index where 0 <= n <= maxLen would cause score to drop by
  // 1.1^n
  const MULTIPLIER = 1.1;

  const { matchPairs, unmatched } = matchResult;
  let score = 0;
  for (let i = 0; i < matchPairs.length; i++) {
    const match = matchPairs[matchPairs.length - 1 - i];
    // weight points based on proximity to today
    const power = maxLen - i;
    const currentMultiplier = Math.pow(MULTIPLIER, power);

    if (match.diff < 0) {
      score -= currentMultiplier;
    } else {
      // fractional point taking into account the number of days off
      const fractionalPoint = getFuzzinessScore(match.diff);
      score += fractionalPoint * currentMultiplier;
    }
  }

  // lose points for each unmatched prediction
  score -= unmatched.length;

  // return rounded off number
  return Number(score.toFixed(3));
}

/**
 * Gets a score for the current match, takes into account length of matches, and weights misses that happen
 * later ( like not matching the last 2 transactions ) more than misses that happen earlier. Also takes
 * into account the accuracy of each prediction.
 *
 * @param {moment.Moment[]} matchResult
 * @param maxLen The max length of the
 */
export function _getScoreV2(matchPairs: Match[], unmatched: DateOnly[]): number {
  // the exponential component is used to weight transactions closer to the beginning as less important
  // such that an unmatched date at the nth index where 0 <= n <= maxLen would cause score to be
  // down-weighed by 0.9^n
  const MULTIPLIER = 0.9;
  let currentMultiplier: number;
  let score = 0.0;
  let denominator = 0.0;
  for (let i = 0; i < matchPairs.length; i++) {
    const match = matchPairs[matchPairs.length - 1 - i];
    // weight points based on proximity to today
    const power = i;
    currentMultiplier = Math.pow(MULTIPLIER, power);

    if (isNil(match.observed)) {
      score -= currentMultiplier;
    } else {
      // fractional point taking into account the number of days off
      const fractionalPoint = getFuzzinessScore(match.diff);
      score += fractionalPoint * currentMultiplier;
    }
    denominator += currentMultiplier;
  }

  // lose points for each unmatched prediction
  score -= unmatched.length * currentMultiplier;

  if (denominator === 0.0 || score < 0.0) {
    return 0.0;
  } else {
    // return rounded off number
    return Number((score / denominator).toFixed(3));
  }
}

export function _matchResultSorter(resultA: MatchResult, resultB: MatchResult) {
  const maxLen = Math.max(resultA.numPredictions, resultB.numPredictions);
  let result = _getScore(resultB, maxLen) - _getScore(resultA, maxLen);

  // tie breaker return one with the most matches
  if (result === 0) {
    result = resultB.numMatches - resultA.numMatches;
  }

  // certain intervals should be preferred
  if (result === 0) {
    result = SCHEDULE_RANK[resultA.interval] - SCHEDULE_RANK[resultB.interval];
  }

  // prefer -1 if all are equal else smallest interval
  if (result === 0) {
    result =
      ROLL_DIRECTION_RANK.indexOf(resultA.rollDirection) -
      ROLL_DIRECTION_RANK.indexOf(resultB.rollDirection);
  }

  return result;
}
