import { updateSynapsepayTransaction } from '../../domain/event';
import { processUpsertSynapsepayTransaction } from './process-upsert-transaction';
import { EventSubscriber } from '../../typings';
import logger from '../../lib/logger';

// TODO we should autogenerate deployments like we do for cronjobs
updateSynapsepayTransaction.subscribe({
  subscriptionName: EventSubscriber.SynapsepayUpsertTransaction,
  onMessage: processUpsertSynapsepayTransaction,
  onError: error => logger.error('Pubsub error synapse upsert transaction', { error }),
});
