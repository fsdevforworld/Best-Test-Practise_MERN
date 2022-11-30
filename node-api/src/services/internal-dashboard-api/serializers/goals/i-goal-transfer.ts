import { IApiGoalTransferStatus, TransferType } from '@dave-inc/banking-goals-internal-api-client';
import { IApiResourceObject } from '../../../../typings';

interface IGoalTransferResource extends IApiResourceObject {
  type: 'goal-transfer';
  attributes: {
    amount: number;
    balanceAfter: number;
    completed: string;
    description: string;
    failed: string;
    initiated: string;
    status: IApiGoalTransferStatus;
    transferType: TransferType;
  };
}

export default IGoalTransferResource;
