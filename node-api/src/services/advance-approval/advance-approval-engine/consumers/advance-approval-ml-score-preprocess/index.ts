import { processEvent } from './process-event';

import { underwritingMlScorePreprocess } from '../../../../../domain/event';

import logger from '../../../../../lib/logger';

import { EventSubscriber } from '../../../../../typings';

underwritingMlScorePreprocess.subscribe({
  subscriptionName: EventSubscriber.UnderwritingMLScorePreprocess,
  onMessage: processEvent,
  onError: error => logger.error('Pubsub underwriting ml preprocess error', { error }),
});

logger.info(`Started consumer ${EventSubscriber.UnderwritingMLScorePreprocess}`);
