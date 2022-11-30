import { QueryTypes } from 'sequelize';
import { times } from 'lodash';
import braze from '../../../lib/braze';
import {
  ConflictError,
  NotFoundError,
  RedeemSubscriptionBillingPromotionError,
} from '../../../lib/error';
import { moment, Moment } from '@dave-inc/time-lib';
import { createSubscriptionBillingUpsertData } from '../../../domain/subscription-billing/create-subscription-billing-upsert-data';
import {
  AuditLog,
  RedeemedSubscriptionBillingPromotion,
  SubscriptionBilling,
  SubscriptionBillingPromotion,
  sequelize,
} from '../../../models';
import { trackFreeMonth } from '../../../helper/subscription-billing';
import { AnalyticsEvent, BrazeProperties } from '../../../typings';
import { InvalidParametersMessageKey } from '../../../translations';
import { FreeMonthSourceName } from '../../../typings/enums';
import { dogstatsd } from '../../../lib/datadog-statsd';
import logger from '../../../lib/logger';

export async function getRedeemableSubscriptionBillingPromotions(
  userId: number,
): Promise<SubscriptionBillingPromotion[]> {
  const query = `
    SELECT *, p.id as id
    FROM subscription_billing_promotion p
    LEFT JOIN redeemed_subscription_billing_promotion r ON
      r.subscription_billing_promotion_id = p.id AND
      r.user_id = ?
    WHERE
      r.id IS NULL
  `;

  const subscriptionBillingPromotions: SubscriptionBillingPromotion[] = await sequelize.query(
    query,
    {
      type: QueryTypes.SELECT,
      replacements: [userId],
      model: SubscriptionBillingPromotion,
      mapToModel: true,
    },
  );

  return subscriptionBillingPromotions;
}

export async function ensureRedeemable(userId: number, subscriptionBillingPromotionId: number) {
  const currentRedeemedSubscriptionBillingPromotion = await RedeemedSubscriptionBillingPromotion.findOne(
    {
      where: { userId, subscriptionBillingPromotionId },
    },
  );

  if (currentRedeemedSubscriptionBillingPromotion) {
    throw new ConflictError(InvalidParametersMessageKey.UserAlreadyRedeemedPromotion);
  }
}

export async function redeemSubscriptionBillingPromotion(
  subscriptionBillingPromotion: SubscriptionBillingPromotion,
  userId: number,
): Promise<RedeemedSubscriptionBillingPromotion> {
  let { months } = subscriptionBillingPromotion;
  const { id, code } = subscriptionBillingPromotion;

  await ensureRedeemable(userId, subscriptionBillingPromotion.id);

  const latestSubscriptionBilling = await SubscriptionBilling.findOne({
    where: { userId },
    order: [['start', 'DESC']],
  });

  const auditLogSubscriptionIds: number[] = [];
  const startTime = latestSubscriptionBilling.start.startOf('month');
  const isPaid = await latestSubscriptionBilling.isPaid();

  try {
    const redemption = await sequelize.transaction(async transaction => {
      if (!isPaid && !latestSubscriptionBilling.isFree()) {
        await latestSubscriptionBilling.update({ amount: 0 }, { transaction });
        months -= 1;
        auditLogSubscriptionIds.push(latestSubscriptionBilling.id);
      }

      const subscriptionBillingUpsertData = times(months, index => {
        const billingDate = startTime.clone().add(index + 1, 'months');
        return createSubscriptionBillingUpsertData(userId, billingDate);
      });

      const subscriptionBillings = await SubscriptionBilling.bulkCreate(
        subscriptionBillingUpsertData,
        {
          transaction,
        },
      );

      subscriptionBillings.forEach(subscriptionBilling => {
        auditLogSubscriptionIds.push(subscriptionBilling.id);
        trackFreeMonth(
          userId,
          subscriptionBilling.start.startOf('month').format('MMMM'),
          code,
          FreeMonthSourceName.Promotion,
        );
      });

      return await RedeemedSubscriptionBillingPromotion.create(
        {
          userId,
          subscriptionBillingPromotionId: id,
        },
        { transaction },
      );
    });

    await AuditLog.create({
      userId,
      type: AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION,
      successful: true,
      eventUuid: userId,
      extra: {
        subscriptionBillingIds: auditLogSubscriptionIds,
        subscriptionBillingPromotionCode: code,
      },
    });

    return redemption;
  } catch (error) {
    logger.error(`Error redeeming ${code} promotion for user: ${userId}`, { ex: error });

    await AuditLog.create({
      userId,
      type: AuditLog.TYPES.REDEEMED_SUBSCRIPTION_BILLING_PROMOTION,
      message: 'ERROR - Failed to redeem promotion',
      successful: false,
      extra: {
        subscriptionBillingIds: auditLogSubscriptionIds,
        subscriptionBillingPromotionCode: code,
      },
      error,
    });

    dogstatsd.increment('subscription_billing.free_month.error', {
      source: FreeMonthSourceName.Promotion,
    });
    throw new RedeemSubscriptionBillingPromotionError(
      'An error has occured while trying to redeem this promotion.',
    );
  }
}

export async function redeemCovid19JoblossSupport(
  userId: number,
  metadata: BrazeProperties,
  timestamp: Moment = moment(),
): Promise<void> {
  const covidJoblossHelp = await SubscriptionBillingPromotion.findOne({
    where: { code: 'COVID_19_JOBLOSS' },
  });
  if (!covidJoblossHelp) {
    throw new NotFoundError(InvalidParametersMessageKey.PromotionDoesNotExist);
  }

  await ensureRedeemable(userId, covidJoblossHelp.id);

  const redemption = await redeemSubscriptionBillingPromotion(covidJoblossHelp, userId);
  const extra = Object.assign({}, metadata, { timestamp });

  try {
    await Promise.all([
      AuditLog.create({
        userId,
        type: AuditLog.TYPES.COVID_19_JOBLOSS,
        successful: true,
        eventUuid: redemption.id,
        extra,
      }),
      braze.track({
        events: [
          {
            name: AnalyticsEvent.Covid19Jobloss,
            externalId: String(userId),
            properties: metadata,
            time: timestamp,
          },
        ],
      }),
    ]);
  } catch (error) {
    logger.error(`Error sending ${AnalyticsEvent.Covid19Jobloss} event`, {
      error,
    });
  }
}
