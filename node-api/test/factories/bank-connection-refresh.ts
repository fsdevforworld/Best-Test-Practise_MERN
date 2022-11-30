import { BankConnectionRefresh } from '../../src/models';

export default function(factory: any) {
  factory.define('bank-connection-refresh', BankConnectionRefresh, {
    bankConnectionId: factory.assoc('bank-connection', 'id'),
  });
}
