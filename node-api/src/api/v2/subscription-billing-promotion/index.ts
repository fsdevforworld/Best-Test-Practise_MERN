import { SubscriptionBillingPromotionResponse } from '@dave-inc/wire-typings';
import { Response } from 'express';
import {
  getRedeemableSubscriptionBillingPromotions,
  redeemSubscriptionBillingPromotion,
  redeemCovid19JoblossSupport,
} from './controller';
import { NotFoundError } from '../../../lib/error';
import { SubscriptionBillingPromotion } from '../../../models';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { InvalidParametersMessageKey } from '../../../translations';

export async function get(
  req: IDaveRequest,
  res: IDaveResponse<SubscriptionBillingPromotionResponse[]>,
): Promise<Response> {
  const redeemableSubscriptionBillingPromotions = await getRedeemableSubscriptionBillingPromotions(
    req.user.id,
  );

  const serializedSubscriptionBillingPromotions = redeemableSubscriptionBillingPromotions.map(
    subscriptionBillingPromotion => subscriptionBillingPromotion.serialize(),
  );

  return res.send(serializedSubscriptionBillingPromotions);
}

export async function triggerPromotion(
  req: IDaveRequest,
  res: IDaveResponse<SubscriptionBillingPromotionResponse[]>,
): Promise<Response> {
  const { promotionCode } = req.params;
  const user = req.user;
  const userId = user.id;
  const subscriptionBillingPromotion = await SubscriptionBillingPromotion.findOne({
    where: { code: promotionCode },
  });

  if (!subscriptionBillingPromotion) {
    throw new NotFoundError(InvalidParametersMessageKey.PromotionDoesNotExist);
  }

  await redeemSubscriptionBillingPromotion(subscriptionBillingPromotion, userId);

  return get(req, res);
}

export async function covid19Jobloss(
  req: IDaveRequest,
  res: IDaveResponse<SubscriptionBillingPromotionResponse[]>,
): Promise<Response> {
  const user = req.user;
  const userId = user.id;

  await redeemCovid19JoblossSupport(userId, req.body);

  return res.sendStatus(200);
}
