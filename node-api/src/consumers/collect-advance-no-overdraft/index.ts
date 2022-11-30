import { collectAdvanceNoOverdraftEvent } from '../../domain/event';
import { processCollectAdvanceNoOverdraftEvent } from './process-event';
import { EventSubscriber } from '../../typings';
import logger from '../../lib/logger';

const MAX_MESSAGES: number = 10;

collectAdvanceNoOverdraftEvent.subscribe({
  subscriptionName: EventSubscriber.AdvanceNoOverdraftCollector,
  onMessage: processCollectAdvanceNoOverdraftEvent,
  onError: (error: Error) => logger.error('Error processing no overdraft advance', { error }),
  options: {
    flowControl: { maxMessages: MAX_MESSAGES },
  },
});
