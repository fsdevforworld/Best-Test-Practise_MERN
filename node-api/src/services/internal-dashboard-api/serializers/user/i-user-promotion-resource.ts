import { IApiResourceObject } from '../../../../typings';

interface IUserPromotionResource extends IApiResourceObject {
  type: 'user-promotion';
  attributes: {
    description: string;
    disbursedAt: string | null;
    disbursementAmount: number | null;
    disbursementReferenceId: string | null;
    eligibleAt: string;
    endAt: string;
    name: string;
    redeemed: boolean;
    startAt: string;
    status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  };
}

export default IUserPromotionResource;
