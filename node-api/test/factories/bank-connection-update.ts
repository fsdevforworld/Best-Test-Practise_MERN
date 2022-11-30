import { DefaultAdapter } from 'factory-girl';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'bank-connection-update');
  factory.define('bank-connection-update', Object, {
    bankConnectionId: factory.assoc('bank-connection', 'id'),
    userId: factory.assoc('bank-connection', 'userId'),
    type: 'PLAID_UPDATE_TRANSACTIONS',
  });
}
