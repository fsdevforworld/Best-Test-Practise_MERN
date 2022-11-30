import { IApiResourceObject } from '../../../../typings';

interface IGoalResource extends IApiResourceObject {
  type: 'goal';
  attributes: {
    created: string;
    currentBalance: number;
    lastTransferAt: string;
    name: string;
    targetAmount: number;
    motivation: string;
  };
}

export default IGoalResource;
