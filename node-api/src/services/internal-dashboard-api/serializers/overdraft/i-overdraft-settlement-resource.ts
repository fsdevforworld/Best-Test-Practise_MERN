import { IApiResourceObject } from '../../../../typings';

interface IOverdraftSettlementResource extends IApiResourceObject {
  type: 'overdraft-settlement';
  attributes: {
    amount: number;
    created: string;
    status: string;
  };
}

export default IOverdraftSettlementResource;
