import { IApiResourceObject } from '../../../../typings';

interface IDaveBankingBanResource extends IApiResourceObject {
  id: string;
  type: 'dave-banking-ban';
  attributes: {
    bannedAt: string;
    reason: string;
    reasonExtra?: string;
  };
}

export default IDaveBankingBanResource;
