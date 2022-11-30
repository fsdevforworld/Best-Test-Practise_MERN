import { IApiResourceObject } from '../../../../typings';

interface IPromotionRedemptionResource extends IApiResourceObject {
  type: 'promotion-redemption';
  attributes: {
    amount: number;
    created: string;
  };
}

export default IPromotionRedemptionResource;
