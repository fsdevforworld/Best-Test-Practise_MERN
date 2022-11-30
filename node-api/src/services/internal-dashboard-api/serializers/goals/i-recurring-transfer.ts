import { IApiResourceObject } from '../../../../typings';

interface IRecurringTransferResource extends IApiResourceObject {
  type: 'recurring-transfer';
  attributes: {
    amount: number;
    created: string;
    interval: string;
    intervalParams: Array<string | number>;
    nextScheduledOn: string;
  };
}

export default IRecurringTransferResource;
