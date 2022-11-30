import { Job } from 'bull';
import { SubscriptionPayment, SubscriptionCollectionAttempt, SubscriptionBilling } from '../models';
import { AnalyticsEvent, BrazeCurrency, AnalyticsRevenueType } from '../typings';
import { get } from 'lodash';
import braze from '../lib/braze';
import amplitude from '../lib/amplitude';
import JobManager from '../lib/job-manager';

export type BroadcastSubscriptionPaymentQueueDate = {
  subscriptionPaymentId: number;
};

async function run(job: Job<BroadcastSubscriptionPaymentQueueDate>): Promise<void> {
  const { subscriptionPaymentId } = job.data;

  const subPayment = await SubscriptionPayment.findByPk(subscriptionPaymentId, {
    include: [SubscriptionCollectionAttempt, SubscriptionBilling],
  });

  const additionalProps = {
    billingCycle: subPayment.subscriptionBillings[0].billingCycle,
    trigger: get(subPayment.subscriptionCollectionAttempt, 'trigger', 'unknown'),
  };

  const brazePurchase = {
    externalId: `${subPayment.userId}`,
    productId: AnalyticsEvent.SubscriptionPayment,
    currency: BrazeCurrency.USA,
    price: subPayment.amount,
    time: subPayment.created,
    properties: additionalProps,
  };

  const amplitudeEvent = {
    eventType: AnalyticsEvent.SubscriptionPayment,
    userId: `${subPayment.userId}`,
    revenue: subPayment.amount,
    revenue_type: AnalyticsRevenueType.Subscription,
    eventProperties: additionalProps,
    time: subPayment.created.format('x'),
  };

  await Promise.all([
    braze.track({
      purchases: [brazePurchase],
    }),
    amplitude.track(amplitudeEvent),
  ]);
}

export const BroadcastSubscriptionPayment = new JobManager<BroadcastSubscriptionPaymentQueueDate>(
  'broadcast-subscription-payment',
  run,
  10,
);
