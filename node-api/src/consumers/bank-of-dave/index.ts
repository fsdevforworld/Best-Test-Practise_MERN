import '0-dd-trace-init-first-datadog-enabled';
import * as config from 'config';
import logger from '../../lib/logger';
import { PubSubClient } from '@dave-inc/pubsub';
import { PubsubConsumerConfig } from '../../typings';
import { handleMessage as handleInsufficientFundsTransactionMessage } from './insufficient-funds-transaction/consumer';
import { handleMessage as handleTransactionsMessage } from './transactions/consumer';
/*
 * Important Note:
 * The k8s deployment for this consumer is configured
 * to have the env variable of PUBSUB_PROJECT_ID
 * set to the banking services google cloud project
 */

const bankOfDaveConfig: PubsubConsumerConfig = config.get('pubsub.bankOfDave');

const topicPrefix = config.get<string>('pubsub.topicPrefix');
const subscriptionPrefix = config.get<string>('pubsub.subscriptionPrefix');

const bankTransactionsTopic: string = bankOfDaveConfig.bankTransactions.topicName;
const bankTransactionsSubscription: string = bankOfDaveConfig.bankTransactions.subscriptionName;
const insufficientFundsTransactionTopic: string =
  bankOfDaveConfig.insufficientFundsTransaction.topicName;
const insufficientFundsTransactionSubscription: string =
  bankOfDaveConfig.insufficientFundsTransaction.subscriptionName;
const projectId: string = bankOfDaveConfig.projectId;

const pubsub = new PubSubClient(projectId, { topicPrefix, subscriptionPrefix });

const getErrorLogger = (subscriptionName: string) => (error: Error) => {
  logger.error(`${error.name} for pubsub subscription ${subscriptionName}`, { error });
};

pubsub.subscribe(
  bankTransactionsTopic,
  bankTransactionsSubscription,
  handleTransactionsMessage,
  getErrorLogger(bankTransactionsSubscription),
);

pubsub.subscribe(
  insufficientFundsTransactionTopic,
  insufficientFundsTransactionSubscription,
  handleInsufficientFundsTransactionMessage,
  getErrorLogger(insufficientFundsTransactionSubscription),
);
