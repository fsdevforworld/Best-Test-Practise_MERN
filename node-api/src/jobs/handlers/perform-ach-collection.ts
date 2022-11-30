import { PerformACHCollectionPayload } from '../data';
import { concurrentForEach } from '../../lib/utils';
import { dogstatsd } from '../../lib/datadog-statsd';
import { Advance, BankAccount, PaymentMethod } from '../../models';
import RefreshBalanceAndCollectTask from '../../domain/collection/refresh-balance-and-collect';
import { BalanceLogCaller } from '../../typings';
import logger from '../../lib/logger';

const CONCURRENCY_LEVEL = 25;

export async function performACHCollection(data: PerformACHCollectionPayload) {
  await concurrentForEach(data.advanceIds, CONCURRENCY_LEVEL, async (advanceId: number) => {
    const advance = await Advance.findByPk(advanceId, {
      include: [
        { model: BankAccount, paranoid: false },
        { model: PaymentMethod, paranoid: false },
      ],
    });

    const task = new RefreshBalanceAndCollectTask(advance, {
      logName: 'LATE_ACH_COLLECTION_JOB',
      caller: BalanceLogCaller.LateACHCollectionJob,
    });

    try {
      const result = await task.run();
      if (result.error) {
        dogstatsd.increment('collect_advance_consumer.scheduled.process_event_error', {
          name: result.error.name,
        });
      } else {
        dogstatsd.increment('collect_advance_consumer.scheduled.process_event_success');
      }
    } catch (ex) {
      logger.error(JSON.stringify(ex));
      dogstatsd.increment('collect_advance_consumer.scheduled.process_event_failure', {
        name: ex.name,
      });
    }
  });
}
