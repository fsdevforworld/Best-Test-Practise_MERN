import { moment } from '@dave-inc/time-lib';
import { UserInfoResponse } from '@dave-inc/promotions-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IUserPromotionResource from './i-user-promotion-resource';

type UserPromo = UserInfoResponse['campaignInfos'][0] & { userId: number };

function getStatus(
  startDate: string,
  endDate: string,
): IUserPromotionResource['attributes']['status'] {
  const startAt = moment(startDate);
  const endAt = moment(endDate);
  const current = moment();

  if (startAt.isAfter(current)) {
    return 'UPCOMING';
  }

  if (endAt.isBefore(current)) {
    return 'CLOSED';
  }

  return 'ACTIVE';
}

const serializer: serialize<
  UserPromo,
  IUserPromotionResource
> = async function serializeUserPromotion(userPromo, relationships) {
  const {
    campaignId,
    description,
    eligibleDate,
    endDate,
    name,
    redeemed,
    redemptionInfo,
    startDate,
    userId,
  } = userPromo;

  return {
    id: `${userId}-${campaignId}`,
    type: 'user-promotion',
    attributes: {
      description: description || null,
      disbursedAt: redemptionInfo?.created || null,
      disbursementAmount: redemptionInfo?.redemptionAmount || null,
      disbursementReferenceId: redemptionInfo?.referenceId || null,
      eligibleAt: eligibleDate || null,
      endAt: endDate || null,
      name: name || null,
      redeemed,
      startAt: startDate || null,
      status: getStatus(startDate, endDate),
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
