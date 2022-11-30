import ErrorHelper from '@dave-inc/error-helper';
import * as config from 'config';
import { Moment } from 'moment';
import * as _ from 'lodash';
import { buildExperiment } from '@dave-inc/experiment';
import { BooleanValue } from '../../typings';
import logger from '../../lib/logger';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../lib/datadog-statsd';
import oracleClient, { PaybackDateBatchScoreResponse } from '../../lib/oracle';
import { getRangeOfPossiblePaybackDates } from '../advance-delivery/payback-dates';
import { AdvancePaybackDatePrediction } from '../../models';
import { PaybackDateBatchScoreResponsePredictions } from '@dave-inc/oracle-client';
import { buildLimiter } from '../../lib/experiment-limiter';
import { PredictedPaybackMlConfig } from '../../services/advance-approval/types';

enum Metric {
  MachineLearningRequest = 'machine_learning.request',
  PredictionResult = 'machine_learning.prediction_result',
}

export enum Strategy {
  EARLIEST_OVER_THRESHOLD = 'earliest_eligable',
  MOST_PROBABLE = 'max_score',
}

export const maxScorePaybackDateExperiment = 'max-score-payback-date';
const maxScorePaybackDateLimit = config.get<number>('experiments.max-score-payback-date.limit');

/**
 * Runnning Experiment: DS2-37: highest score, earliest.
 * @param userId
 */
export async function getStrategyByExperiment(userId: number): Promise<Strategy> {
  const experiment = buildExperiment(maxScorePaybackDateExperiment, {
    experiment: () => Strategy.MOST_PROBABLE,
    control: () => Strategy.EARLIEST_OVER_THRESHOLD,
    limiter: buildLimiter(maxScorePaybackDateExperiment, maxScorePaybackDateLimit),
  });

  return experiment(userId);
}

function getByStrategy(
  strategy: Strategy,
  predictions: PaybackDateBatchScoreResponsePredictions[],
  modelConfig: PredictedPaybackMlConfig,
): PaybackDateBatchScoreResponsePredictions {
  switch (strategy) {
    case Strategy.MOST_PROBABLE: {
      if (predictions.length > 0) {
        return predictions.sort((a, b) => b.score - a.score)[0];
      }
      break;
    }
    case Strategy.EARLIEST_OVER_THRESHOLD:
    default: {
      return (
        predictions
          // Sort earliest to latest
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .find(({ score }) => score > modelConfig.scoreLimit)
      );
    }
  }
}

export const PREDICTED_PAYBACK_MODEL_CONFIG = config.get<PredictedPaybackMlConfig>(
  'ml.predictedPayback',
);

/**
 * Attempts to predict a payback date for a given advance approval
 * We will choose the earliest predicted date that is above the threshold set in our config
 * Results are logged to the payback_date_prediction table
 *
 * @param {number} advanceApprovalId
 * @param {number} userId
 * @param {number} bankAccountId
 * @param {Strategy} strategy - will accept a strategy for picking a date or default
 *                              to a value which may be an experiment.
 * @param {PredictedPaybackMlConfig} config - config for this predicted payback model
 * @returns {Promise<Moment | null>}
 */
export async function predictPaybackDate({
  advanceApprovalId,
  userId,
  bankAccountId,
  strategy,
  modelConfig = PREDICTED_PAYBACK_MODEL_CONFIG,
}: {
  advanceApprovalId: number;
  userId: number;
  bankAccountId: number;
  strategy?: Strategy;
  modelConfig?: PredictedPaybackMlConfig;
}): Promise<Moment | null> {
  if (_.isNil(strategy)) {
    strategy = await getStrategyByExperiment(userId);
  }

  if (modelConfig.enabled !== BooleanValue.True && modelConfig.enabled !== true) {
    dogstatsd.increment(Metric.PredictionResult, {
      model_type: modelConfig.modelType,
      success: '0',
      failure_reason: 'disabled',
    });
    return null;
  }

  const paybackDateWindow = getRangeOfPossiblePaybackDates();
  const oracle = oracleClient(modelConfig.oracle);
  let response: PaybackDateBatchScoreResponse;
  try {
    ({ data: response } = await oracle.batchScorePaybackDate(modelConfig.modelType, {
      user_id: userId,
      bank_account_id: bankAccountId,
      dates: Array.from(paybackDateWindow.by('day')).map(day => day.tz(DEFAULT_TIMEZONE).ymd()),
    }));
  } catch (err) {
    logger.error('Predicted payback date request failed', {
      err: ErrorHelper.logFormat(err),
      advanceApprovalId,
      userId,
      bankAccountId,
    });
    dogstatsd.increment(Metric.PredictionResult, {
      model_type: modelConfig.modelType,
      success: '0',
      failure_reason: 'ml-request-failure',
    });

    return null;
  } finally {
    dogstatsd.increment(Metric.MachineLearningRequest, {
      model_type: modelConfig.modelType,
      success: response ? '1' : '0',
    });
  }

  const validPredictions = response.predictions
    // Filter out invalid dates
    .filter(({ date }) => paybackDateWindow.contains(moment(date)));

  const prediction = getByStrategy(strategy, validPredictions, modelConfig);

  await AdvancePaybackDatePrediction.bulkCreate(
    response.predictions.map(({ date, score }) => ({
      advanceApprovalId,
      predictedDate: moment(date),
      score,
      success: date === prediction?.date,
      extra: {
        model: {
          type: modelConfig.modelType,
          threshold: modelConfig.scoreLimit,
          oracleVersion: `v${modelConfig.oracle.version.major}.${modelConfig.oracle.version.minor}`,
          strategy: strategy.toString(),
        },
      },
    })),
  );

  dogstatsd.increment(Metric.PredictionResult, {
    model_type: modelConfig.modelType,
    success: prediction ? '1' : '0',
    failure_reason: prediction ? undefined : 'no-eligible-predictions',
  });

  return prediction ? moment(prediction.date) : null;
}

/**
 * Returns the date that was successfully predicted and above the ML threshold for the given advance approval
 *
 * @param {number} advanceApprovalId
 * @returns {Promise<moment.Moment | null>}
 */
export async function getPredictedPaybackDate(advanceApprovalId: number): Promise<Moment | null> {
  const prediction = await AdvancePaybackDatePrediction.findOne({
    where: { advanceApprovalId, success: true },
  });
  if (!prediction) {
    return null;
  }

  return moment(prediction.predictedDate);
}
