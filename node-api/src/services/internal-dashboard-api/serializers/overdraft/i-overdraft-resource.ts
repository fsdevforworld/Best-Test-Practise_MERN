import { IApiResourceObject } from '../../../../typings';

interface IOverdraftResource extends IApiResourceObject {
  type: 'overdraft';
  attributes: {
    approvedAmount: number;
    created: string;
    screenshotUrl: string;
    settlementDate: string;
    status: string;
  };
}

export default IOverdraftResource;
