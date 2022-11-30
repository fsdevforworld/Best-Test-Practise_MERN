import { Message } from '@google-cloud/pubsub';
import { BankingDataSource } from '@dave-inc/wire-typings';

import { Advance, BankAccount, PaymentMethod } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import RefreshBalanceAndCollectTask from '../../domain/collection/refresh-balance-and-collect';
import { BankDataSourceRefreshError, CUSTOM_ERROR_CODES } from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import { isProdEnv } from '../../lib/utils';
import logger from '../../lib/logger';

export async function processAdvanceCollectionEvent(event: Message, data: any) {
  dogstatsd.increment('collect_advance_consumer.event_received');

  const { advanceId, time } = data;
  const momentTime = time && !isProdEnv() ? moment(time) : moment();

  const advance = await Advance.findByPk(advanceId, {
    include: [
      { model: BankAccount, paranoid: false },
      { model: PaymentMethod, paranoid: false },
    ],
  });

  const task = new RefreshBalanceAndCollectTask(advance, { time: momentTime });

  try {
    const result = await task.run();
    if (
      result.error &&
      result.error instanceof BankDataSourceRefreshError &&
      result.error.customCode === CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT
    ) {
      // nack on rate limit so we retry immediately, except for MX since their rate limits are 4 hours
      // we'll let the next job pick it up
      if (result.error.source === BankingDataSource.Mx) {
        dogstatsd.increment('collect_advance_consumer.rate_limit_pass', {
          balanceSource: result.error.source,
        });
        event.ack();
      } else {
        dogstatsd.increment('collect_advance_consumer.rate_limit_retry', {
          balanceSource: result.error.source,
        });
        event.nack();
      }
    } else {
      dogstatsd.increment('collect_advance_consumer.process_event_success');
      event.ack();
    }
  } catch (ex) {
    logger.error('Collect advance process event failure', { ex });
    dogstatsd.increment('collect_advance_consumer.process_event_failure', { name: ex.name });
    event.ack();
  }
}
