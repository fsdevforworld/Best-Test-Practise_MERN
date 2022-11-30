import { Advance, AdvanceTip, Payment } from '../../models';
import { AnalyticsEvent, AnalyticsRevenueType, AnalyticsUserProperty } from '../../typings';
import braze from '../../lib/braze';
import amplitude from '../../lib/amplitude';
import { get } from 'lodash';
import BigNumber from 'bignumber.js';
import { moment } from '@dave-inc/time-lib';
import { Op } from 'sequelize';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

export type BroadcastPaymentChangedData = {
  paymentId: number;
  time?: string;
};

export async function broadcastPaymentChanged({
  paymentId,
  time,
}: BroadcastPaymentChangedData): Promise<void> {
  const payment = await Payment.findOne({
    where: { id: paymentId },
    include: [{ model: Advance, include: [AdvanceTip] }],
  });

  let eventName: AnalyticsEvent;

  if (payment.status === ExternalTransactionStatus.Returned) {
    eventName = AnalyticsEvent.PaymentReturned;
  } else if (payment.status === ExternalTransactionStatus.Canceled) {
    eventName = AnalyticsEvent.PaymentCanceled;
  } else {
    return;
  }

  const eventAmount = new BigNumber(payment.amount).negated().toNumber();

  const oldestUnpaidAdvance = await Advance.findOne({
    where: { userId: payment.userId, outstanding: { [Op.gt]: 0 }, paybackFrozen: false },
    order: [['paybackDate', 'ASC']],
  });

  const { advance } = payment;
  let userAttributesAdvance = advance;
  let updatedDueDate = get(oldestUnpaidAdvance, 'paybackDate', null);
  if (updatedDueDate) {
    updatedDueDate = updatedDueDate.format('YYYY-MM-DD');
    userAttributesAdvance = oldestUnpaidAdvance;
  }
  const userAttributes = await userAttributesAdvance.getUserAttributes();

  const additionalData = {
    advanceId: advance.id,
  };

  const brazeUserAttributes = {
    ...userAttributes,
    externalId: `${userAttributesAdvance.userId}`,
    [AnalyticsUserProperty.AdvanceDueDate]: updatedDueDate,
  };

  const amplitudeEvent = {
    eventType: eventName,
    userId: `${payment.userId}`,
    revenue: eventAmount,
    revenue_type: AnalyticsRevenueType.Advance,
    eventProperties: additionalData,
    time: moment(time).format('x'),
    userProperties: {
      [AnalyticsUserProperty.AdvanceDueDate]: updatedDueDate,
    },
  };

  const identifyData = {
    user_id: `${userAttributesAdvance.userId}`,
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
    }),
    amplitude.track(amplitudeEvent),
    amplitude.identify(identifyData),
  ]);
}
