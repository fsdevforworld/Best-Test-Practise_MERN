import ErrorHelper from '@dave-inc/error-helper';
import * as config from 'config';

import { IUnderwritingMLScoreEventData } from '../../typings';

import { UnderwritingMlConfig, UnderwritingModelConfigKey, UnderwritingModelParams } from './types';

import { underwritingMlScore } from '../../domain/event';

import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import oracleClient, { IOracleConfig, UnderwritingModelScoreResponse } from '../../lib/oracle';

enum Metric {
  RequestFailed = 'machine_learning.advance_approval.request.failed',
  RequestSucceeded = 'machine_learning.advance_approval.request.succeeded',
  ScoringJobTriggered = 'machine_learning.advance_approval.scoring_job.triggered',
}

/**
 * Requests for an advance approval score for the given model
 *
 * @param {UnderwritingModelParams} request
 * @param {IOracleConfig} oracleConfig
 * @returns {Promise<UnderwritingModelScoreResponse>}
 */
export async function getUnderwritingMlScore(
  request: UnderwritingModelParams,
  { oracleConfig }: { oracleConfig: IOracleConfig },
): Promise<UnderwritingModelScoreResponse> {
  const oracle = oracleClient(oracleConfig);

  try {
    // Oracle will be  moving away from enum model names
    const { data: response } = await oracle.scoreUnderwritingModel(request.modelType as any, {
      user_id: request.userId,
      bank_account_id: request.bankAccountId,
      payback_date: request.paybackDate.ymd(),
      cache_only: request.cacheOnly,
    });

    dogstatsd.increment(Metric.RequestSucceeded, {
      model: request.modelType,
      used_cache: response.metadata.cached_at ? '1' : '0',
      cache_only: request.cacheOnly ? '1' : '0',
      cached_from: response.metadata.cached_from,
      source: `oraclev${oracleConfig.version.major}.${oracleConfig.version.minor}`,
    });

    return response;
  } catch (err) {
    logger.error('Failed to get underwriting ml score', {
      err: ErrorHelper.logFormat(err),
      request: {
        userId: request.userId,
        bankAccountId: request.bankAccountId,
        paybackDate: request.paybackDate.format('YYYY-MM-DD'),
        modelType: request.modelType,
        cacheOnly: request.cacheOnly,
        source: `oraclev${oracleConfig.version.major}.${oracleConfig.version.minor}`,
      },
    });
    dogstatsd.increment(Metric.RequestFailed, {
      model: request.modelType,
      cache_only: request.cacheOnly ? '1' : '0',
      source: `oraclev${oracleConfig.version.major}.${oracleConfig.version.minor}`,
    });

    throw err;
  }
}

/**
 * Trigger job to score advance approval models for the provided params
 *
 * @param {IUnderwritingMLScoreEventData} data
 * @returns {Promise<void>}
 */
export async function triggerUnderwritingMlScoringJob(data: IUnderwritingMLScoreEventData) {
  await underwritingMlScore.publish(data);

  dogstatsd.increment(Metric.ScoringJobTriggered, {
    trigger: data.trigger,
  });
}

/**
 * Returns the model configuration under the provided configuration key
 *
 * @param {UnderwritingModelConfigKey} configKey
 * @returns {UnderwritingMlConfig}
 */
export function getUnderwritingModelConfig(
  configKey: UnderwritingModelConfigKey,
): UnderwritingMlConfig {
  return config.get<UnderwritingMlConfig>(`ml.underwriting.${configKey}`);
}

export function isMLEnabled(): boolean {
  return config.get<boolean>('ml.underwritingEnabled');
}
