import { IApiResourceObject } from '../../../../typings';

interface IOverdraftAccountResource extends IApiResourceObject {
  type: 'overdraft-account';
  attributes: {
    balance: number;
    status: string;
  };
}

export default IOverdraftAccountResource;
