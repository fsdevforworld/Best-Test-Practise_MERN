import { DefaultAdapter } from 'factory-girl';
import * as Faker from 'faker';
import {
  TabapayNetworkResponseCode,
  TabapayRequestTransactionStatus,
} from '@dave-inc/loomis-client';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'tabapay-create-transaction-response');

  factory.define('tabapay-create-transaction-response', Object, {
    SC: 200,
    EC: '0',
    transactionId: () => Faker.random.alphaNumeric(22),
    network: 'Visa',
    networkRC: TabapayNetworkResponseCode.COMPLETED,
    status: TabapayRequestTransactionStatus.Completed,
    approvalCode: () => Faker.random.alphaNumeric(6),
  });
}
