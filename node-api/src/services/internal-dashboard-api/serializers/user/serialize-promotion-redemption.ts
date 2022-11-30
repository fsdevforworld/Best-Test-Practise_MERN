import { RedemptionInfo } from '@dave-inc/promotions-client';
import serialize from '../serialize';
import IPromotionRedemptionResource from './i-promotion-redemption-resource';

const serializer: serialize<
  RedemptionInfo,
  IPromotionRedemptionResource
> = async function serializeRedemption(redemption) {
  const { created, redemptionAmount, referenceId } = redemption;

  return {
    id: `${referenceId}`,
    type: 'promotion-redemption',
    attributes: {
      amount: redemptionAmount,
      created,
    },
  };
};

export default serializer;
