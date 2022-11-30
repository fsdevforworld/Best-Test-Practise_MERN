import { BooleanValue, IUnderwritingMLScorePreprocessEventData } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as config from 'config';
import { underwritingMlScorePreprocess } from '../event';

const USE_BACKGROUND_SCORING = config.get('ml.useBackgroundScoring') === BooleanValue.True;

enum Metric {
  PreprocessJobSkipped = 'machine_learning.advance_approval.preprocess_job.skipped',
  PreprocessJobTriggered = 'machine_learning.advance_approval.preprocess_job.triggered',
}

/**
 * Trigger job to determine if bank account is eligible for advance approval ml re-score
 *
 * @param {IUnderwritingMLScorePreprocessEventData} data
 * @returns {Promise<void>}
 */
export async function triggerUnderwritingMlPreprocessJob(
  data: IUnderwritingMLScorePreprocessEventData,
) {
  if (!USE_BACKGROUND_SCORING) {
    dogstatsd.increment(Metric.PreprocessJobSkipped, {
      trigger: data.trigger,
    });
    return;
  }

  await underwritingMlScorePreprocess.publish(data);

  dogstatsd.increment(Metric.PreprocessJobTriggered, {
    trigger: data.trigger,
  });
}
