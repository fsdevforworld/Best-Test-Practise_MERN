import '0-dd-trace-init-first-datadog-enabled';

import { subscribe } from '../../../consumers/utils';
import logger from '../../../lib/logger';
import { EventSubscriber, IDaveBankingAccountClosed } from '../../../typings';
import { daveBankingAccountClosed } from '../../event';
import {
  closeDaveBankingAccount,
  CloseDaveBankingAccountError,
} from '../close-dave-banking-account';
import { DaveBankingMetrics as Metrics, metrics } from '../metrics';

const topic = daveBankingAccountClosed;
const subscriptionName = EventSubscriber.DaveBankingCloseDaveBankingAccount;

async function onProcessData(data: IDaveBankingAccountClosed) {
  const metadata = { data, subscriptionName };

  try {
    await closeDaveBankingAccount(data);

    metrics.increment(Metrics.CLOSE_DAVE_BANKING_ACCOUNT_SUCCEEDED);
    logger.info(
      `${subscriptionName} successfully processed dave banking account closure on overdraft`,
      metadata,
    );
  } catch (error) {
    if (error instanceof CloseDaveBankingAccountError) {
      const { reason } = error;

      metrics.increment(Metrics.CLOSE_DAVE_BANKING_ACCOUNT_FAILED, { reason });
      logger.info(
        `${subscriptionName} consumer failed to process dave banking account closure on overdraft`,
        {
          ...metadata,
          error: {
            data: error.data,
            reason,
          },
        },
      );

      return;
    }

    metrics.increment(Metrics.CLOSE_DAVE_BANKING_ACCOUNT_FAILED, {
      reason: 'error',
    });
    logger.error(`Unhandled error in ${subscriptionName} consumer`, {
      ...metadata,
      error: { message: error.message, name: error.name, stack: error.stack, ...error },
    });
  }
}

if (require.main === module) {
  subscribe<IDaveBankingAccountClosed>({ onProcessData, subscriptionName, topic });
}
