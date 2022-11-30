import { RecurringTransaction } from '../../../../models';

import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';

interface IRecurringTransactionResource extends IApiResourceObject {
  type: 'recurring-transaction';
  attributes: {
    name: string;
  };
}

const serializeRecurringTransaction: serialize<
  RecurringTransaction,
  IRecurringTransactionResource
> = async (recurringTransaction: RecurringTransaction) => {
  return {
    type: 'recurring-transaction',
    id: `${recurringTransaction.id}`,
    attributes: {
      name: recurringTransaction.userDisplayName,
    },
  };
};

export { IRecurringTransactionResource };
export default serializeRecurringTransaction;
