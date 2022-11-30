import { Moment } from 'moment';
import { RecurringTransaction } from '../models';
import { has, isArray, isInteger, sortBy, toInteger, toString } from 'lodash';
import { InvalidParametersError } from './error';
import { DateOnly, moment, WEEKDAYS } from '@dave-inc/time-lib';
import {
  RecurringScheduleParams,
  RecurringTransactionInterval,
  RollDirection,
} from '@dave-inc/wire-typings';

const { MONTHLY, SEMI_MONTHLY, BIWEEKLY, WEEKLY, WEEKDAY_MONTHLY } = RecurringTransactionInterval;

export const MONTLY_PARAMS_INVALID = 'Monthly params should be -1 or integers between 1 and 28';

export enum GeneratorDirection {
  BACKWARDS = -1,
  FORWARDS = 1,
}

export type DateGenerator = (previous: DateOnly, direction?: GeneratorDirection) => DateOnly;
export type DateInitializer = (min: DateOnly, direction?: GeneratorDirection) => DateOnly;

export class RSched {
  get id() {
    let week: number = null;
    if (this.interval === BIWEEKLY) {
      week = RSched.getWeekSinceEpoch(this.weeklyStart) % 2;
    }
    this.weeklyStart.toMoment().unix();
    return `${this.interval}-${JSON.stringify(this.params)}-${this.rollDirection}-${week}`;
  }

  public static fromRecurringTransaction(recurring: RecurringTransaction): RSched {
    return new RSched(
      recurring.interval,
      recurring.params,
      recurring.rollDirection,
      recurring.dtstart,
    );
  }

  public static getWeekSinceEpoch(date: DateOnly): number {
    // Is this an even or odd week from the epoch
    const daysSinceEpoch = date.daysSinceEpoch();
    // the - 3 is because the epoch was on a thursday and we count a week as starting from sunday
    // so actually this is weeks since the sunday after the epoch
    return Math.floor((daysSinceEpoch - 3) / 7);
  }

  public static validateRschedParams(
    interval: RecurringTransactionInterval,
    params: RecurringScheduleParams,
    rollDirection: RollDirection = 0,
  ): RecurringScheduleParams {
    switch (interval) {
      case MONTHLY:
        if (!isArray(params) || params.some(p => !isInteger(p))) {
          throw new InvalidParametersError('params should be array of integers with length 1');
        }
        // There was an old test for this. If no params are passed then default to the first.
        if (params.length === 0) {
          params = [1];
        }
        RSched.validateMonthlyParam(params as number[]);
        break;
      case SEMI_MONTHLY:
        if (params.length !== 2 || params.some(p => !isInteger(p))) {
          throw new InvalidParametersError('params should be array of integers with length 2');
        }
        RSched.validateMonthlyParam(params as number[]);
        break;
      case BIWEEKLY:
        if (params.length !== 1 || !has(WEEKDAYS, params[0])) {
          throw new InvalidParametersError('params[0] must be lowercased weekday');
        }
        break;
      case WEEKLY:
        if (!isArray(params) || params.some(p => !has(WEEKDAYS, p))) {
          throw new InvalidParametersError('params must be an array of lowercased weekdays');
        }

        params = sortBy(params, day => WEEKDAYS[day]);

        break;
      case WEEKDAY_MONTHLY:
        if (params.length !== 2 || !has(WEEKDAYS, params[1]) || !isInteger(params[0])) {
          throw new InvalidParametersError('params must be an integer and a day of the week');
        }
        if (params[0] > 4 || params[0] < 1) {
          throw new InvalidParametersError('params[0] must be an integer between 1 and 4');
        }
        break;
      default:
        throw new InvalidParametersError('Unrecognized Interval');
    }

    if (!isInteger(rollDirection) || rollDirection < -2 || rollDirection > 2) {
      throw new InvalidParametersError('Roll direction must be an integer between -2 and 2');
    }

    return params;
  }

  /**
   * When generating initial values if we are generating forwards, we want the initial value to always
   * be less than the start value. This is because we don't calculate rolling when determining inital value.
   * so it is not guranteed that an the first initial date without rolling after the start will be the first initial
   * date with rolling after the start.
   *
   * @param {moment.Moment} start
   * @param {moment.Moment} initialValue
   * @param {GeneratorDirection} direction
   * @returns {boolean}
   */
  private static isCorrectInitialValueBasedOnDirection(
    start: DateOnly,
    initialValue: DateOnly,
    direction: GeneratorDirection,
  ): boolean {
    const isForwardAndBefore =
      direction === GeneratorDirection.FORWARDS && initialValue.isBefore(start);
    const isBackwardAndAfter =
      direction === GeneratorDirection.BACKWARDS && initialValue.isAfter(start);
    return isForwardAndBefore || isBackwardAndAfter;
  }

  /**
   * Gets the correct day of the month given by momentInMonth for monthly rsched params.
   * This is a convenience function for getting the right day of month when the dayOfMonth is -1.
   * @param {moment.Moment} momentInMonth could be any moment with the same month as the desired month.
   * @param {number} dayOfMonth
   * @returns {moment.Moment}
   */
  private static getMomentFromDayOfMonth(dayInMonth: DateOnly, dayOfMonth: number) {
    if (dayOfMonth === -1) {
      return dayInMonth.clone().setToEndOfMonth();
    } else {
      return dayInMonth.clone().setDate(dayOfMonth);
    }
  }

  private static validateMonthlyParam(params: number[]) {
    params.forEach(param => {
      if (param > 28 || param < -1 || param === 0) {
        throw new InvalidParametersError(MONTLY_PARAMS_INVALID);
      }
    });
  }

  public readonly interval: RecurringTransactionInterval;
  public readonly params: RecurringScheduleParams;
  /**
   * Needed for biweekly as we need to know the correct week to start from when iterating every
   * other week.
   */
  public weeklyStart: DateOnly;
  public rollDirection: RollDirection;

  constructor(
    interval: RecurringTransactionInterval,
    params: RecurringScheduleParams,
    rollDirection: RollDirection = 0,
    weeklyStart: Moment | DateOnly = moment(),
  ) {
    this.params = RSched.validateRschedParams(interval, params, rollDirection);

    if (interval === BIWEEKLY && !weeklyStart) {
      throw new InvalidParametersError('weeklyStart is required for biweekly intervals');
    }

    this.interval = interval;
    this.rollDirection = rollDirection;
    if (!weeklyStart) {
      this.weeklyStart = DateOnly.now();
    } else if (weeklyStart instanceof DateOnly) {
      this.weeklyStart = weeklyStart;
    } else {
      this.weeklyStart = DateOnly.fromMoment(weeklyStart);
    }
  }

  private get initialDateFunctions(): { [p in RecurringTransactionInterval]: DateInitializer } {
    return {
      MONTHLY: this.getMonthlyInitializer(),
      SEMI_MONTHLY: this.getSemiMonthlyInitializer(),
      WEEKDAY_MONTHLY: this.getWeekdayMonthlyInitializer,
      WEEKLY: this.getWeeklyInitializer,
      BIWEEKLY: this.getWeeklyInitializer,
    };
  }

  private get dateGeneratorFunctions(): { [p in RecurringTransactionInterval]: DateGenerator } {
    return {
      MONTHLY: this.getMonthlyGenerator(),
      SEMI_MONTHLY: this.getSemiMonthlyGenerator(),
      WEEKDAY_MONTHLY: this.weekdayMonthlyGenerator,
      WEEKLY: this.weeklyGenerator,
      BIWEEKLY: this.weeklyGenerator,
    };
  }

  public between<T extends Moment | DateOnly>(min: T, max: T, inclusive: boolean = false): T[] {
    const dates: DateOnly[] = this.findDatesBetween(
      this.initialDateFunctions[this.interval],
      this.dateGeneratorFunctions[this.interval],
      min instanceof DateOnly ? min : DateOnly.fromMoment(min as Moment),
      max instanceof DateOnly ? max : DateOnly.fromMoment(max as Moment),
      inclusive,
    );

    if (min instanceof DateOnly) {
      return dates as T[];
    } else {
      return dates.map(d => d.toMoment()) as T[];
    }
  }

  public after<T extends Moment | DateOnly>(after: T, inclusive: boolean = false): T {
    const date: DateOnly = this.findFirstDateAfter(
      this.initialDateFunctions[this.interval],
      this.dateGeneratorFunctions[this.interval],
      after instanceof DateOnly ? after : DateOnly.fromMoment(after as Moment),
      inclusive,
    );

    if (after instanceof DateOnly) {
      return date as T;
    } else {
      return date.toMoment() as T;
    }
  }

  public before<T extends Moment | DateOnly>(before: T, inclusive: boolean = false): T {
    const date: DateOnly = this.findFirstDateBefore(
      this.initialDateFunctions[this.interval],
      this.dateGeneratorFunctions[this.interval],
      before instanceof DateOnly ? before : DateOnly.fromMoment(before as Moment),
      inclusive,
    );

    if (before instanceof DateOnly) {
      return date as T;
    } else {
      return date.toMoment() as T;
    }
  }

  private findDatesBetween(
    getInitialDate: DateInitializer,
    generator: DateGenerator,
    min: DateOnly,
    max: DateOnly,
    inclusive: boolean = false,
  ): DateOnly[] {
    if (min.isAfter(max)) {
      throw Error(`${min} can not be greater than ${max}`);
    }
    let dates: DateOnly[] = [];
    let currentDate = getInitialDate(min);
    let rolled = currentDate.clone().nextBankingDay(this.rollDirection);
    while (rolled.isBefore(max, inclusive)) {
      // Roll off of weekends and holidays if rollDirection is not 0
      if (rolled.isAfter(min, inclusive)) {
        dates = dates.concat(rolled);
      }
      currentDate = generator(currentDate);
      rolled = currentDate.clone().nextBankingDay(this.rollDirection);
    }

    return dates;
  }

  private findFirstDateAfter(
    getInitialDate: (min: DateOnly) => DateOnly,
    generator: (previous: DateOnly) => DateOnly,
    after: DateOnly,
    inclusive: boolean = false,
  ): DateOnly {
    let currentDate = getInitialDate(after.clone());
    while (true) {
      // Roll off of weekends and holidays if rollDirection is not 0
      const actual = currentDate.nextBankingDay(this.rollDirection);
      if (actual.isAfter(after, inclusive)) {
        return actual;
      }
      currentDate = generator(currentDate);
    }
  }

  private findFirstDateBefore(
    getInitialDate: DateInitializer,
    generator: DateGenerator,
    before: DateOnly,
    inclusive: boolean = false,
  ): DateOnly {
    let currentDate = getInitialDate(before.clone(), GeneratorDirection.BACKWARDS);
    while (true) {
      // Roll off of weekends and holidays if rollDirection is not 0
      const actual = currentDate.nextBankingDay(this.rollDirection);
      if (actual.isBefore(before, inclusive)) {
        return actual;
      }
      currentDate = generator(currentDate, GeneratorDirection.BACKWARDS);
    }
  }

  private weekdayMonthlyFormat = (x: DateOnly): [number, string] => {
    return [Math.ceil(x.date / 7), x.getWeekdayName()];
  };

  private getMonthlyInitializer = () => {
    const dayOfMonth = toInteger(this.params[0]);
    return (min: DateOnly, direction: GeneratorDirection = GeneratorDirection.FORWARDS) => {
      const inMonth = RSched.getMomentFromDayOfMonth(min, dayOfMonth);
      // We want the date to be either before ( if the direction is forward ) or after ( if the direction is backward )
      // the min. This checks if it is before or after then
      if (RSched.isCorrectInitialValueBasedOnDirection(min, inMonth, direction)) {
        return inMonth;
      } else {
        return RSched.getMomentFromDayOfMonth(min.clone().addMonths(-direction), dayOfMonth);
      }
    };
  };

  private getMonthlyGenerator = () => {
    const dayOfMonth = toInteger(this.params[0]);
    return this.getMonthlyGeneratorFromParam(dayOfMonth);
  };

  private getSemiMonthlyInitializer = () => {
    const firstDay = toInteger(this.params[0]);
    const secondDay = toInteger(this.params[1]);
    return (min: DateOnly, direction: GeneratorDirection = GeneratorDirection.FORWARDS) => {
      // get the date closest to the min.
      const dates = [
        RSched.getMomentFromDayOfMonth(min, firstDay),
        RSched.getMomentFromDayOfMonth(min, secondDay),
        RSched.getMomentFromDayOfMonth(min.clone().addMonths(-direction), firstDay),
        RSched.getMomentFromDayOfMonth(min.clone().addMonths(-direction), secondDay),
      ];
      // get only the dates before or after depending on direction
      const filtered = dates.filter(d =>
        RSched.isCorrectInitialValueBasedOnDirection(min, d, direction),
      );

      return this.getClosestDate(filtered, min);
    };
  };

  private getSemiMonthlyGenerator = () => {
    const firstDay = toInteger(this.params[0]);
    const secondDay = toInteger(this.params[1]);
    return (previous: DateOnly, direction = GeneratorDirection.FORWARDS): DateOnly => {
      const firstDate = this.getMonthlyGeneratorFromParam(firstDay)(previous, direction);
      const secondDate = this.getMonthlyGeneratorFromParam(secondDay)(previous, direction);
      // both dates are before/after (depending on direction) so return the closest one.
      return this.getClosestDate([firstDate, secondDate], previous);
    };
  };

  private getMonthlyGeneratorFromParam = (dayOfMonth: number) => {
    return (previous: DateOnly, direction = GeneratorDirection.FORWARDS): DateOnly => {
      const clone = RSched.getMomentFromDayOfMonth(previous.clone(), dayOfMonth);
      // depending on the direction we want to be sure the next date is greater or less than the previous
      if (direction === GeneratorDirection.FORWARDS && clone.isAfter(previous)) {
        return clone;
      } else if (direction === GeneratorDirection.BACKWARDS && clone.isBefore(previous)) {
        return clone;
      }

      // else we can guarantee the next/previous date will be one month over.
      return RSched.getMomentFromDayOfMonth(clone.addMonths(direction), dayOfMonth);
    };
  };

  private sortByClosest(dates: DateOnly[], comparisonDate: DateOnly): DateOnly[] {
    return dates.sort((a, b) => {
      return Math.abs(a.compare(comparisonDate)) - Math.abs(b.compare(comparisonDate));
    });
  }

  private getClosestDate(dates: DateOnly[], comparisionDate: DateOnly): DateOnly {
    return this.sortByClosest(dates, comparisionDate)[0];
  }

  private getWeeklyInitializer = (
    min: DateOnly,
    direction: GeneratorDirection = GeneratorDirection.FORWARDS,
  ): DateOnly => {
    this.adjustWeeklyStartIfNeeded();

    const closestOccurrenceToDate = (date: DateOnly) => {
      const occurrencesInWeek = this.params.map(day => date.clone().setDay(WEEKDAYS[day]));
      const filteredOptionsForThisWeek = occurrencesInWeek.filter(dateOption =>
        RSched.isCorrectInitialValueBasedOnDirection(min, dateOption, direction),
      );

      return this.getClosestDate(filteredOptionsForThisWeek, min);
    };

    if (this.weeklyMatch(min)) {
      const date = closestOccurrenceToDate(min);
      if (date) {
        return date;
      }
    }

    const dateInCorrectWeek = min.clone();
    const maxAdjustmentDistance = 30;

    do {
      dateInCorrectWeek.addWeeks(-direction);
    } while (
      !this.weeklyMatch(dateInCorrectWeek) &&
      Math.abs(dateInCorrectWeek.compare(min)) < maxAdjustmentDistance
    );

    return closestOccurrenceToDate(dateInCorrectWeek);
  };

  private adjustWeeklyStartIfNeeded() {
    const correctWeekday = this.weeklyStart.clone().setDay(WEEKDAYS[this.params[0]]);
    if (correctWeekday.isBefore(this.weeklyStart)) {
      const after = correctWeekday.clone().addWeeks(1);
      this.weeklyStart = this.getClosestDate([correctWeekday, after], this.weeklyStart);
    }
  }

  private weeklyGenerator = (
    previous: DateOnly,
    direction = GeneratorDirection.FORWARDS,
  ): DateOnly => {
    const start = previous.clone();

    let weeks = 1;
    if (this.interval === BIWEEKLY) {
      weeks = 2;
    }

    const daysInGenerationOrder = sortBy(
      this.params.map(day => WEEKDAYS[day]),
      day => direction * day,
    );

    let nextDay = daysInGenerationOrder.find(day => direction * day > direction * start.day);

    if (!nextDay) {
      nextDay = daysInGenerationOrder[0];
      start.addWeeks(direction * weeks);
    }
    start.setDay(nextDay);

    return start;
  };

  private getWeekdayMonthlyInitializer = (min: DateOnly): DateOnly => {
    return this.getWeekdayMonthlyDateInMonth(min, this.params);
  };

  /**
   * Find the weekday monthly matching date in the month from the provided
   * monthDate.
   * @param {moment.Moment} monthDate
   * @param {[number, string]} params
   * @returns {moment.Moment}
   */
  private getWeekdayMonthlyDateInMonth(
    monthDate: DateOnly,
    params: RecurringScheduleParams,
  ): DateOnly {
    const currentDate = monthDate.clone();
    const weekOfMonth = toInteger(params[0]);
    const dayOfWeek = toString(params[1]);
    let [wom, daw] = this.weekdayMonthlyFormat(currentDate);
    // converges to correct params in < 2 attempts
    while (wom !== weekOfMonth || dayOfWeek.toUpperCase() !== daw.toUpperCase()) {
      const weeks = (weekOfMonth - wom) * 7;
      currentDate.addDays(WEEKDAYS[dayOfWeek] - currentDate.day + weeks);
      // re-adjust month incase we went over also handle last day of month
      const monthDiff =
        monthDate.month - currentDate.month + 12 * (monthDate.year - currentDate.year);
      currentDate.addWeeks(monthDiff);
      [wom, daw] = this.weekdayMonthlyFormat(currentDate);
    }

    return currentDate;
  }

  private weekdayMonthlyGenerator = (
    previous: DateOnly,
    direction: GeneratorDirection = GeneratorDirection.FORWARDS,
  ): DateOnly => {
    const current = previous.addMonths(direction);
    return this.getWeekdayMonthlyDateInMonth(current, this.params);
  };

  private weeklyMatch(date: DateOnly) {
    if (this.interval !== RecurringTransactionInterval.BIWEEKLY) {
      return true;
    } else {
      return RSched.getWeekSinceEpoch(this.weeklyStart) % 2 === RSched.getWeekSinceEpoch(date) % 2;
    }
  }
}
