import { StandardResponse, SubscriptionBillingResponse } from '@dave-inc/wire-typings';
import { Response } from 'express';

import { createSubscriptionBillingUpsertData } from '../../domain/subscription-billing/create-subscription-billing-upsert-data';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { getSubscriptionBillings } from '../../helper/subscription-billing';
import { AlreadyExistsError } from '../../lib/error';
import { SubscriptionBilling } from '../../models';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { InvalidParametersMessageKey } from '../../translations';

/**
 * Bills with statuses about their payments.
 */
export async function get(
  req: IDaveRequest,
  res: IDaveResponse<SubscriptionBillingResponse[]>,
): Promise<Response> {
  const userId = req.user.id;
  const subscriptionBillings = await getSubscriptionBillings(userId);
  return res.send(subscriptionBillings);
}

/**
 * Gives a user two months of free subscription billings.
 */
export async function twoMonthsFree(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const user = req.user;
  const userId = user.id;

  if (user.usedTwoMonthsFree) {
    throw new AlreadyExistsError(InvalidParametersMessageKey.AlreadyUsedGetTwoFreeMonths);
  }

  // Mark that this user has used the two months free promotion
  await user.update({ usedTwoMonthsFree: moment().format(MOMENT_FORMATS.DATETIME) });

  // Get all subscription billings for a user
  const allBillings = SubscriptionBilling.findAll({
    where: { userId },
  });

  // Make each unpaid billing 'free' by setting the amount to 0
  await allBillings
    .filter(async (billing: SubscriptionBilling) => (await billing.isPaid()) === false)
    .map((billing: SubscriptionBilling) => billing.update({ amount: 0 }));

  // Give the user two free months of subscription billings
  const nextMonth = moment().add(1, 'months');
  const secondMonth = moment().add(2, 'months');

  await Promise.all([
    SubscriptionBilling.upsert(createSubscriptionBillingUpsertData(userId, nextMonth)),
    SubscriptionBilling.upsert(createSubscriptionBillingUpsertData(userId, secondMonth)),
  ]);

  return res.send({ ok: true });
}
