import { buildExperiment } from '@dave-inc/experiment';
import logger from '../../lib/logger';
import { DateRange, DEFAULT_TIMEZONE, Moment, moment } from '@dave-inc/time-lib';
import { isBankingDay } from '../../lib/banking-days';
import * as MachineLearningDomain from '../machine-learning';
import { Strategy } from '../machine-learning';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalTrigger,
  PredictedPaybackMlConfig,
} from '../../services/advance-approval/types';
import { ABTestingEvent, AdvanceApproval } from '../../models';
import { buildLimiter } from '../../lib/experiment-limiter';
import * as config from 'config';
import { pick } from 'lodash';

/**
 * Range of 4 to 11 days just in case we have a user select a standard advance
 *
 * @param {Moment} start
 * @returns {DateRange}
 */
export function getRangeOfPossiblePaybackDates(start: Moment = moment()): DateRange {
  const fourDaysFromNow = moment(start)
    .tz(DEFAULT_TIMEZONE)
    .startOf('day')
    .add(4, 'day');

  const elevenDaysFromNow = moment(start)
    .tz(DEFAULT_TIMEZONE)
    .startOf('day')
    .add(11, 'days');

  return moment.range(fourDaysFromNow, elevenDaysFromNow);
}

/**
 * Attempts to predict a better default payback date for tiny money users via ML
 * This should handle any errors gracefully
 *
 * @param {AdvanceApprovalCreateResponse} approval
 * @returns {Promise<AdvanceApprovalCreateResponse>}
 */
export async function adjustDefaultPaybackDateForTinyMoney(
  approval: AdvanceApprovalCreateResponse,
): Promise<AdvanceApprovalCreateResponse> {
  try {
    if (!approval.microAdvanceApproved) {
      throw new Error('Approval is not associated with a micro advance');
    }

    const predictedPaybackDate = await MachineLearningDomain.predictPaybackDate({
      advanceApprovalId: approval.id,
      userId: approval.userId,
      bankAccountId: approval.bankAccountId,
    });
    if (!predictedPaybackDate) {
      return approval;
    }

    await AdvanceApproval.update(
      {
        defaultPaybackDate: predictedPaybackDate,
      },
      { where: { id: approval.id } },
    );

    approval.defaultPaybackDate = predictedPaybackDate.ymd();

    return approval;
  } catch (err) {
    logger.error('Error while predicting default payback date for tiny money experiment', {
      err,
      approval: pick(approval, ['approvalId', 'userId', 'bankAccountId']),
    });

    return approval;
  }
}

// We're running two separate experiments because the majority of payback dates fall on fridays,
// and we want to make sure to capture a statistically significant number of results for non-friday payback
export enum AddOneDayExperiment {
  Friday = 'add-one-day-to-payback-date_friday',
  NotFriday = 'add-one-day-to-payback-date_not-friday',
}

export async function addOneDayExperiment(approval: AdvanceApprovalCreateResponse) {
  const { userId, id } = approval;

  let experimentName: string;
  const date = moment(approval.defaultPaybackDate);
  if (date.day() === 5) {
    experimentName = AddOneDayExperiment.Friday;
  } else {
    experimentName = AddOneDayExperiment.NotFriday;
  }

  const limit = config.get<number>(`experiments.${experimentName}.limit`);

  const experiment = buildExperiment(experimentName, {
    experiment: async (): Promise<AdvanceApprovalCreateResponse> => {
      const newDate = moment(date)
        .clone()
        .add(1, 'day');

      await Promise.all([
        ABTestingEvent.create({
          userId,
          eventName: experimentName,
          eventUuid: id,
          extra: {
            oldDate: date.ymd(),
            newDate: newDate.ymd(),
          },
        }),
        AdvanceApproval.update(
          {
            defaultPaybackDate: newDate,
          },
          { where: { id } },
        ),
      ]);

      return {
        ...approval,
        defaultPaybackDate: newDate.ymd(),
      };
    },
    control: () => approval,
    limiter: buildLimiter(experimentName, limit),
  });

  return experiment(userId);
}

export const GlobalPaybackDateModelExperiment = 'global-payback-date-model-experiment';

export const GLOBAL_PREDICTED_PAYBACK_MODEL_CONFIG = config.get<PredictedPaybackMlConfig>(
  'ml.globalPredictedPayback',
);

const ExperimentLimit = config.get<number>(
  'experiments.global-payback-date-model-experiment.limit',
);

export type GlobalExperimentResponse = {
  mlSucceeded: boolean;
  advanceApproval: AdvanceApprovalCreateResponse;
};

export async function globalPaybackDateModelExperiment(
  approval: AdvanceApprovalCreateResponse,
): Promise<AdvanceApprovalCreateResponse> {
  const { userId, id } = approval;

  const date = moment(approval.defaultPaybackDate);

  const experiment = buildExperiment<GlobalExperimentResponse>(GlobalPaybackDateModelExperiment, {
    experiment: async (): Promise<GlobalExperimentResponse> => {
      const newDate = await MachineLearningDomain.predictPaybackDate({
        advanceApprovalId: approval.id,
        userId: approval.userId,
        bankAccountId: approval.bankAccountId,
        modelConfig: GLOBAL_PREDICTED_PAYBACK_MODEL_CONFIG,
        strategy: Strategy.MOST_PROBABLE,
      });
      if (!newDate) {
        return { mlSucceeded: false, advanceApproval: approval };
      }
      await Promise.all([
        ABTestingEvent.create({
          userId,
          eventName: GlobalPaybackDateModelExperiment,
          eventUuid: id,
          extra: {
            oldDate: date.ymd(),
            newDate: newDate.ymd(),
          },
        }),
        AdvanceApproval.update(
          {
            defaultPaybackDate: newDate,
          },
          { where: { id } },
        ),
      ]);

      return {
        mlSucceeded: true,
        advanceApproval: {
          ...approval,
          defaultPaybackDate: newDate.ymd(),
        },
      };
    },
    control: () => ({ mlSucceeded: false, advanceApproval: approval }),
    limiter: buildLimiter(GlobalPaybackDateModelExperiment, ExperimentLimit),
    incrementBy(result: GlobalExperimentResponse) {
      return result.mlSucceeded ? 1 : 0;
    },
  });

  const { advanceApproval: experimentResult } = await experiment(userId);
  return experimentResult;
}

export async function conditionallyAdjustPaybackDate(
  approval: AdvanceApprovalCreateResponse,
  trigger: AdvanceApprovalTrigger,
): Promise<AdvanceApprovalCreateResponse> {
  const isRealApproval = trigger === AdvanceApprovalTrigger.UserTerms;
  if (approval.microAdvanceApproved && isRealApproval) {
    return adjustDefaultPaybackDateForTinyMoney(approval);
  }

  if (approval.incomeValid && isRealApproval) {
    // if experiment is turned off approval will remain the same
    approval = await addOneDayExperiment(approval);
  }

  if (isRealApproval) {
    approval = await globalPaybackDateModelExperiment(approval);
  }

  return approval;
}

/**
 * Returns a list of all available payback dates for tiny money users to choose from
 * By default, this will only return valid banking days, with the exception of users who we predicted
 * a payback date on the weekend
 *
 * @param {number | undefined} advanceApprovalId
 * @returns {Promise<string[]>}
 */
export async function getAvailableDatesForNoIncome({
  advanceApprovalId,
}: { advanceApprovalId?: number } = {}): Promise<string[]> {
  const window = getRangeOfPossiblePaybackDates();

  const availableDays = Array.from(window.by('day'))
    .filter(isBankingDay)
    .map(day => day.tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD'));

  if (advanceApprovalId) {
    const predictedPaybackDate = await MachineLearningDomain.getPredictedPaybackDate(
      advanceApprovalId,
    );

    if (predictedPaybackDate) {
      const predictedPaybackDateString = predictedPaybackDate.format('YYYY-MM-DD');
      const isDateValidAndUnique =
        window.contains(predictedPaybackDate) &&
        !availableDays.includes(predictedPaybackDateString);

      if (isDateValidAndUnique) {
        availableDays.push(predictedPaybackDateString);
      }
    }
  }

  return availableDays.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}
