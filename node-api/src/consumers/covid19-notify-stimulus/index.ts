import '0-dd-trace-init-first-datadog-enabled';
import ErrorHelper from '@dave-inc/error-helper';
import { Message } from '@google-cloud/pubsub';
import * as config from 'config';
import { bankConnectionUpdateCompletedEvent } from '../../domain/event';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import {
  BankConnectionUpdateType,
  BooleanValue,
  EventSubscriber,
  IBankConnectionUpdateCompletedEventData,
} from '../../typings';
import * as NotifyStimulus from './notify-stimulus';

async function process(
  event: Message,
  data: IBankConnectionUpdateCompletedEventData,
): Promise<void> {
  event.ack();

  if (
    data.updateType !== BankConnectionUpdateType.DEFAULT_UPDATE &&
    data.updateType !== BankConnectionUpdateType.INITIAL_UPDATE
  ) {
    return;
  }

  try {
    await NotifyStimulus.notifyStimulus(data.bankAccountIds);
  } catch (error) {
    dogstatsd.increment('covid19_stimulus.process_error');
    logger.error(
      'Error sending Braze notification for COVID-19 stimulus',
      ErrorHelper.logFormat(error),
    );
  }
}

function main() {
  const subscriptionName = EventSubscriber.Covid19NotifyStimulus;
  bankConnectionUpdateCompletedEvent.subscribe({
    subscriptionName,
    onMessage: process,
    onError: (err: Error) => {
      logger.error(`${subscriptionName} error`, {
        errorName: err.name,
        errorMessage: err.message,
      });
    },
  });
}

function isEnabled(): boolean {
  const enabledConfig = config.get('pubsub.covid19Stimulus.enabled');
  return enabledConfig === true || enabledConfig === BooleanValue.True;
}

if (isEnabled()) {
  main();
  logger.info(`Started consumer ${EventSubscriber.Covid19NotifyStimulus}`);
} else {
  logger.info(`Consumer ${EventSubscriber.Covid19NotifyStimulus} disabled by config flag`);
}
