import { IApiResourceObject } from '../../../../typings';

interface ISpendingAccountResource extends IApiResourceObject {
  id: string;
  type: 'spending-account';
  attributes: {
    accountNumber: string;
    currentBalance: number;
    created: string;
    name: string;
    routingNumber: string;
    status: string;
  };
}

export default ISpendingAccountResource;
