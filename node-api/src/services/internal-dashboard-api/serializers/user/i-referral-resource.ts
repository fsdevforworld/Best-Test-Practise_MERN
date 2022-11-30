import { PromoRedemptionStatus } from '@dave-inc/promotions-client';
import { IApiResourceObject } from '../../../../typings';

interface IReferralResource extends IApiResourceObject {
  type: 'referral';
  attributes: {
    created: string;
    description: string;
    name: string;
    status: PromoRedemptionStatus;
  };
}

export default IReferralResource;
