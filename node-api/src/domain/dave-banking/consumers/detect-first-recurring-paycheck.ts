import '0-dd-trace-init-first-datadog-enabled';

import { subscribe } from '../../../consumers/utils';
import logger from '../../../lib/logger';
import { EventSubscriber, INewRecurringTransactionData } from '../../../typings';
import { newRecurringTransactionEvent } from '../../event';
import {
  detectFirstRecurringPaycheck,
  DetectFirstRecurringPaycheckError,
} from '../detect-first-recurring-paycheck';
import { DaveBankingMetrics as Metrics, metrics } from '../metrics';

const topic = newRecurringTransactionEvent;
const subscriptionName = EventSubscriber.DaveBankingDetectFirstRecurringPaycheck;

async function onProcessData(data: INewRecurringTransactionData) {
  const metadata = { data, subscriptionName };

  try {
    await detectFirstRecurringPaycheck(data);
    metrics.increment(Metrics.DETECT_FIRST_RECURRING_PAYCHECK_SUCCEEDED);
    logger.info('Detected first Dave Banking recurring paycheck', metadata);
  } catch (error) {
    if (error instanceof DetectFirstRecurringPaycheckError) {
      const { reason } = error;
      metrics.increment(Metrics.DETECT_FIRST_RECURRING_PAYCHECK_FAILED, { reason });
      logger.info('Did not detect first Dave Banking recurring paycheck', {
        ...metadata,
        error: {
          data: error.data,
          reason,
        },
      });
      return;
    }

    metrics.increment(Metrics.DETECT_FIRST_RECURRING_PAYCHECK_FAILED, {
      reason: 'error',
    });
    logger.error(`Unhandled error in ${subscriptionName} consumer`, {
      ...metadata,
      error: { message: error.message, name: error.name, stack: error.stack, ...error },
    });
  }
}

if (require.main === module) {
  subscribe<INewRecurringTransactionData>({ onProcessData, subscriptionName, topic });
}
