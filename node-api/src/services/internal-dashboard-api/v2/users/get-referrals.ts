import promotionsClient, {
  ReferredCampaignInfo,
  ReferredCampaignInfoResponse,
} from '@dave-inc/promotions-client';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { User } from '../../../../models';
import { serializeMany, userSerializers } from '../../serializers';
import * as Bluebird from 'bluebird';

async function fetchReferrals(userId: number): Promise<ReferredCampaignInfoResponse> {
  try {
    const res = await promotionsClient.getUserReferrals({ userId });
    return res;
  } catch (err) {
    if (err?.status === 404) {
      return {
        referees: [],
        referrers: [],
      };
    }

    throw err;
  }
}

type Included = userSerializers.IPromotionRedemption;

async function serializeCampaignInfos(campaignInfos: ReferredCampaignInfo[]) {
  const data: userSerializers.IReferralResource[] = [];
  const included: Included[] = [];

  await Bluebird.each(campaignInfos, async referral => {
    const redemptions = referral.redemptionInfos || [];

    const serializedRedemptions = await serializeMany(
      redemptions,
      userSerializers.serializePromotionRedemption,
    );

    const serializedReferee = await userSerializers.serializeReferral(referral, {
      redemptions: serializedRedemptions,
    });

    included.push(...serializedRedemptions);
    data.push(serializedReferee);
  });

  return { data, included };
}

async function getReferrals(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<userSerializers.IReferralResource[], Included>,
) {
  const { resource: user } = req;

  const { referees, referrers } = await fetchReferrals(user.id);

  const [
    { data: refereeData, included: refereeIncluded },
    { data: referrerData, included: referrerIncluded },
  ] = await Promise.all([serializeCampaignInfos(referees), serializeCampaignInfos(referrers)]);

  res.send({
    data: [...refereeData, ...referrerData],
    included: [...refereeIncluded, ...referrerIncluded],
  });
}

export default getReferrals;
