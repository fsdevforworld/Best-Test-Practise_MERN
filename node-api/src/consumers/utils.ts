import { Message } from '@google-cloud/pubsub';
import { IEvent, PubSubError } from '@dave-inc/pubsub';
import { dogstatsd } from '../lib/datadog-statsd';
import logger from '../lib/logger';

export async function applyMessageConsumer(caller: string, consumer: Promise<any>): Promise<any> {
  try {
    const result = await consumer;
    dogstatsd.increment(`${caller}.handle_message_success`);
    return result;
  } catch (error) {
    logger.error('Error applying message consumer', { error, caller });
    dogstatsd.increment(`${caller}.handle_message_error`);
  }
}

type MainArgs<T, R> = {
  topic: IEvent<T>;
  subscriptionName: string;
  onProcessData: (data: T, event?: Message) => Promise<R>;
};
export function subscribe<T, R = void>({ topic, subscriptionName, onProcessData }: MainArgs<T, R>) {
  const onMessage = async (event: Message, data: T): Promise<void> => {
    try {
      await onProcessData(data, event);
      event.ack();
    } catch (error) {
      onError(error); // should mostly be caught by consumer
      if (error instanceof PubSubError && error.shouldRetry()) {
        event.nack();
      } else {
        event.ack();
      }
    }
  };

  // onError happens when there is an error with the PubSub setup,
  // Example: Topic Not Found
  const onError = (error: Error) => {
    logger.error(`${subscriptionName} error`, { error });
  };

  topic.subscribe({ subscriptionName, onMessage, onError });
  logger.info(`Started consumer ${subscriptionName}`);
}
