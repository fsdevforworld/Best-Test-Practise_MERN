import { IApiResourceObject } from '../../../../typings';

interface IDaveBankingCardResource extends IApiResourceObject {
  id: string;
  type: 'spending-card'; // Add to this if other types of accounts can have cards
  attributes: {
    created: string;
    status: string;
    isVirtual: boolean;
    lastFour: string;
  };
}

export default IDaveBankingCardResource;
