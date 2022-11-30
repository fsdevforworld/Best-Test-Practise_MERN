import { ReferredCampaignInfo } from '@dave-inc/promotions-client';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';
import IReferralResource from './i-referral-resource';

const serializer: serialize<
  ReferredCampaignInfo,
  IReferralResource
> = async function serializeReferral(referredCampaignInfo, relationships) {
  const {
    eligibleDate,
    description,
    name,
    redemptionStatus,
    referrerId,
    refereeId,
    segmentId,
  } = referredCampaignInfo;

  return {
    id: `referral-${segmentId}-${refereeId}`,
    type: 'referral',
    attributes: {
      created: eligibleDate,
      description,
      name,
      status: redemptionStatus,
    },
    relationships: {
      ...serializeRelationships(relationships),
      referrer: {
        data: referrerId ? { type: 'user', id: referrerId.toString() } : null,
      },
      referee: {
        data: refereeId ? { type: 'user', id: refereeId?.toString() } : null,
      },
    },
  };
};

export default serializer;
