import { IApiResourceObject } from '../../../../typings';

interface IBankTransactionResource extends IApiResourceObject {
  type: 'bank-transaction';
  attributes: {
    amount: number;
    created: string;
    displayName: string;
    pending: boolean;
    transactionDate: string;
    updated: string;
  };
}

export default IBankTransactionResource;
