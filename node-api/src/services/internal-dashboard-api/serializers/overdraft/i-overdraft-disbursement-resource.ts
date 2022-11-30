import { IApiResourceObject } from '../../../../typings';

interface IOverdraftDisbursementResource extends IApiResourceObject {
  type: 'overdraft-disbursement';
  attributes: {
    amount: number;
    status: string;
  };
}

export default IOverdraftDisbursementResource;
