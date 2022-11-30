import { tivanAdvanceProcessed } from '../../domain/event';
import { EventSubscriber } from '../../typings';
import logger from '../../lib/logger';

import { processTivanRepaymentResult } from './process-event';

const MAX_MESSAGES: number = 10;

tivanAdvanceProcessed.subscribe({
  subscriptionName: EventSubscriber.RepaymentResultProcessor,
  onMessage: processTivanRepaymentResult,
  onError: (error: Error) => logger.error('Error processing tivan repayment result', { error }),
  options: {
    flowControl: { maxMessages: MAX_MESSAGES },
  },
});
