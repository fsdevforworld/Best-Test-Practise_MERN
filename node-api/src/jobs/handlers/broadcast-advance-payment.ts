import { get } from 'lodash';
import { Op } from 'sequelize';
import { BroadcastAdvancePaymentPayload } from '../data';
import amplitude from '../../lib/amplitude';
import braze from '../../lib/braze';
import { Advance, AdvanceCollectionAttempt, AdvanceTip, Payment } from '../../models';
import {
  AnalyticsEvent,
  AnalyticsRevenueType,
  AnalyticsUserProperty,
  BrazeUserAttributes,
  BrazeEvent,
} from '../../typings';

export async function broadcastAdvancePayment({
  paymentId,
}: BroadcastAdvancePaymentPayload): Promise<void> {
  const payment = await Payment.findOne({
    where: { id: paymentId },
    include: [{ model: Advance, include: [AdvanceTip] }],
  });

  const [collectionAttempt, oldestUnpaidAdvance] = await Promise.all([
    AdvanceCollectionAttempt.findOne({
      where: { paymentId: payment.id },
    }),
    Advance.findOne({
      where: { userId: payment.userId, outstanding: { [Op.gt]: 0 }, paybackFrozen: false },
      order: [['paybackDate', 'ASC']],
    }),
  ]);

  const { advance, userId } = payment;
  let userAttributesAdvance = advance;
  let updatedDueDate = get(oldestUnpaidAdvance, 'paybackDate', null);
  if (updatedDueDate) {
    updatedDueDate = updatedDueDate.format('YYYY-MM-DD');
    userAttributesAdvance = oldestUnpaidAdvance;
  }

  const additionalData = {
    advanceId: advance.id,
    remainingBalance: advance.outstanding,
    trigger: get(collectionAttempt, 'trigger', 'unknown'),
  };

  const userAttributes = await userAttributesAdvance.getUserAttributes();
  const brazeUserAttributes: BrazeUserAttributes = {
    ...userAttributes,
    externalId: `${userId}`,
    [AnalyticsUserProperty.AdvanceDueDate]: updatedDueDate,
  };
  const brazeEvent: BrazeEvent = {
    name: AnalyticsEvent.AdvancePayment,
    externalId: `${userId}`,
    properties: {
      isPaidInFull: advance.outstanding <= 0,
    },
    time: payment.created,
  };

  const amplitudeEvent = {
    eventType: AnalyticsEvent.AdvancePayment,
    userId: `${userId}`,
    revenue: payment.amount,
    revenue_type: AnalyticsRevenueType.Advance,
    eventProperties: additionalData,
    time: payment.created.format('x'),
    userProperties: {
      [AnalyticsUserProperty.AdvanceDueDate]: updatedDueDate,
    },
  };

  const identifyData = {
    user_id: `${userId}`,
    user_properties: {
      $set: {
        ...userAttributes,
        [AnalyticsUserProperty.AdvanceDueDate]: updatedDueDate,
      },
    },
  };

  await Promise.all([
    braze.track({
      attributes: [brazeUserAttributes],
      events: [brazeEvent],
    }),
    amplitude.track(amplitudeEvent),
    amplitude.identify(identifyData),
  ]);
}
