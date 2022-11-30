import {
  DaveBankingPubSubAccount,
  DaveBankingPubSubTransaction,
  DaveBankingPubSubUser,
} from '@dave-inc/wire-typings';
import { Message } from '@google-cloud/pubsub';
import logger from '../../../lib/logger';
import { applyMessageConsumer } from '../../utils';
import { consumeBankTransactions } from './bank-transactions';

type Data = {
  account: DaveBankingPubSubAccount;
  transactions: DaveBankingPubSubTransaction[];
  user: DaveBankingPubSubUser;
};

export async function handleMessage(message: Message, data: Data) {
  const { account, transactions, user } = data;
  logger.info('Handling BOD Transaction message', {
    user,
    account,
    transactions,
    publishTime: message.publishTime.toISOString(),
  });

  await applyMessageConsumer(
    'consume_bank_of_dave_transactions',
    consumeBankTransactions(account, transactions, message.publishTime.toISOString()),
  );

  message.ack();
}
