import { Message } from '@google-cloud/pubsub';
import { Advance, AdvanceCollectionSchedule, BankAccount, PaymentMethod } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import RefreshBalanceAndCollectTask from '../../domain/collection/refresh-balance-and-collect';
import { BalanceLogCaller } from '../../typings';
import logger from '../../lib/logger';

export async function processScheduledAdvanceCollectionEvent(event: Message, data: any) {
  dogstatsd.increment('collect_scheduled_advance_consumer.event_receieved');

  const { advanceId } = data;

  const advance = await Advance.findByPk(advanceId, {
    include: [
      { model: BankAccount, paranoid: false },
      { model: PaymentMethod, paranoid: false },
      { model: AdvanceCollectionSchedule },
    ],
  });

  if (!advance) {
    dogstatsd.increment('collect_scheduled_advance_consumer.process_event_failure', 1, [
      'name:advance_not_found',
    ]);

    event.ack();

    return;
  }

  const task = new RefreshBalanceAndCollectTask(advance, {
    logName: 'DAILY_SCHEDULED_AUTO_RETRIEVE',
    caller: BalanceLogCaller.DailyScheduledAutoRetrieveJob,
    retrieveFullOutstanding: true,
  });

  try {
    await task.run();
  } catch (ex) {
    logger.error('Collect schedule advance failure', { ex });
    dogstatsd.increment('collect_scheduled_advance_consumer.process_event_failure', 1, [
      `name:${ex.name}`,
    ]);
  }

  dogstatsd.increment('collect_scheduled_advance_consumer.process_event_success');

  event.ack();
}
