import { PromiseType } from 'utility-types';
import { BankConnection, BankAccount } from '../../../../models';
import { PaymentMethod } from '@dave-inc/loomis-client';

export default function organizeConnections(
  conns: PromiseType<ReturnType<typeof BankConnection.getByUserIdWithInstitution>>,
  accounts: BankAccount[],
  methods: PaymentMethod[],
  overrides: any[],
  predictions: any[],
) {
  return conns.map(conn => {
    return {
      ...conn,
      accounts: accounts
        .filter(a => a.bankConnectionId === conn.id)
        .map(a => {
          return {
            ...a.toJSON(),
            overrides: overrides.filter(o => o.bankAccountId === a.id),
            methods: methods.filter(m => m.bankAccountId === a.id),
            predictions: predictions.filter(m => m.bankAccountId === a.id),
          };
        }),
    };
  });
}
