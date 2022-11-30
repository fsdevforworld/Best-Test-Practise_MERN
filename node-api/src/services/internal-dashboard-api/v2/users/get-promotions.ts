import { orderBy } from 'lodash';
import promotionsClient, { UserInfoResponse } from '@dave-inc/promotions-client';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { User } from '../../../../models';
import { serializeMany, userSerializers } from '../../serializers';

async function fetchPromos(userId: number): Promise<UserInfoResponse> {
  try {
    const res = await promotionsClient.getUserInfo({ userId });
    return res;
  } catch (err) {
    if (err?.status === 404) {
      return {
        userId,
        campaignInfos: [],
      };
    }

    throw err;
  }
}

async function getPromotions(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<userSerializers.IUserPromotionResource[]>,
) {
  const { resource: user } = req;

  const { campaignInfos } = await fetchPromos(user.id);
  const userPromos = campaignInfos.map(campaignInfo => ({ ...campaignInfo, userId: user.id }));

  const data = await serializeMany(userPromos, userSerializers.serializeUserPromotion);
  const sortedData = orderBy(data, 'attributes.eligibleAt', 'desc');

  res.send({
    data: sortedData,
  });
}

export default getPromotions;
