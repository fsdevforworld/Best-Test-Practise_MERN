import { DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import BigNumber from 'bignumber.js';
import { get } from 'lodash';
import { BroadcastAdvanceDisbursementPayload } from '../data';
import amplitude from '../../lib/amplitude';
import { AppsFlyerEvents, logAppsflyerEvent } from '../../lib/appsflyer';
import Braze from '../../lib/braze';
import {
  Advance,
  AdvanceExperiment,
  AdvanceExperimentLog,
  AdvanceTip,
  BankAccount,
  Institution,
  PaymentMethod,
  User,
} from '../../models';
import {
  AnalyticsEvent,
  AppsflyerProperties,
  AnalyticsRevenueType,
  AnalyticsUserProperty,
  BrazeCurrency,
  BrazeEvent,
  BrazeProperties,
  BrazePurchase,
  BrazeUserAttributes,
} from '../../typings';

export async function broadcastAdvanceDisbursement(
  data: BroadcastAdvanceDisbursementPayload,
): Promise<void> {
  const { advanceId } = data;

  const advance = await Advance.findByPk(advanceId, {
    include: [
      { model: PaymentMethod },
      { model: AdvanceTip },
      { model: User },
      { model: BankAccount, include: [Institution] },
    ],
  });
  const [advanceUserAttributes, advanceExperimentLog] = await getAdvanceAttributeAndExperimentLog(
    advance,
  );
  const additionalData = getEventProperties(advance, advanceExperimentLog);

  await Promise.all([
    handleBrazeEvent(advance, additionalData, advanceUserAttributes),
    handleAmplitudeEvents(advance, additionalData, advanceUserAttributes),
    handleAppsflyerEvent(advance, data),
  ]);
}

async function getAdvanceAttributeAndExperimentLog(advance: Advance) {
  return Promise.all([
    advance.getUserAttributes(),
    AdvanceExperimentLog.findOne({
      where: {
        userId: advance.userId,
        advanceId: advance.id,
        success: true,
      },
      include: [AdvanceExperiment],
    }),
  ]);
}

function getEventProperties(advance: Advance, advanceExperimentLog: AdvanceExperimentLog) {
  const { id, amount, created, paybackDate, fee, paymentMethod, bankAccount, advanceTip } = advance;
  return {
    advanceId: id,
    amount,
    createdWithOffset: created
      .clone()
      .tz(DEFAULT_TIMEZONE)
      .format(),
    paybackDate: paybackDate.format('YYYY-MM-DD'),
    deliveryFee: fee,
    tipAmount: advanceTip.amount,
    paymentMethodLastFour: get(paymentMethod, 'mask'),
    institutionName: bankAccount.institution.displayName,
    isExperimental: Boolean(advanceExperimentLog),
    experimentName: advanceExperimentLog?.experiment?.name || '',
  };
}

async function handleAmplitudeEvents(
  advance: Advance,
  eventProperties: BrazeProperties,
  advanceUserAttributes: Partial<BrazeUserAttributes>,
) {
  const amplitudeEvent = {
    eventType: AnalyticsEvent.AdvanceDisbursed,
    userId: `${advance.userId}`,
    revenue: new BigNumber(advance.amount).negated().toNumber(),
    revenue_type: AnalyticsRevenueType.Advance,
    eventProperties,
    time: advance.created.format('x'),
  };

  const identifyData = {
    user_id: `${advance.userId}`,
    user_properties: {
      $add: {
        disbursed_advances: 1,
      },
      $set: advanceUserAttributes,
    },
  };

  return Promise.all([amplitude.track(amplitudeEvent), amplitude.identify(identifyData)]);
}

async function handleBrazeEvent(
  advance: Advance,
  properties: BrazeProperties,
  advanceUserAttributes: Partial<BrazeUserAttributes>,
) {
  const attributes: BrazeUserAttributes[] = [
    {
      ...advanceUserAttributes,
      [AnalyticsUserProperty.PushNotificationsEnabled]: advance.user.hasPushNotificationsEnabled(),
      [AnalyticsUserProperty.TextMessagesEnabled]: advance.user.hasSMSNotificationsEnabled(),
      externalId: `${advance.userId}`,
    },
  ];

  const brazePurchase = {
    externalId: `${advance.userId}`,
    currency: BrazeCurrency.USA,
    time: advance.created,
    properties,
  };

  const brazeAdvanceTipPurchase: BrazePurchase = {
    ...brazePurchase,
    productId: AnalyticsEvent.AdvanceTipSet,
    price: advance?.advanceTip.amount,
  };

  const brazeAdvanceFeePurchase: BrazePurchase = {
    ...brazePurchase,
    productId: AnalyticsEvent.AdvanceExpressSet,
    price: advance.fee,
  };

  const purchases: BrazePurchase[] = [brazeAdvanceTipPurchase, brazeAdvanceFeePurchase].filter(
    ({ price }) => price > 0,
  );

  const events: BrazeEvent[] = [
    {
      name: AnalyticsEvent.AdvanceDisbursed,
      externalId: `${advance.userId}`,
      time: advance.created,
      properties,
    },
  ];

  return Braze.track({ attributes, purchases, events });
}

async function handleAppsflyerEvent(advance: Advance, data: AppsflyerProperties) {
  const { appsflyerDeviceId, ip, platform } = data;
  const { fee, userId } = advance;
  const eventName = AppsFlyerEvents.ADVANCE_DISBURSED;
  const eventValue = JSON.stringify({ af_revenue: fee });

  return logAppsflyerEvent({
    userId,
    platform,
    eventName,
    eventValue,
    ip,
    appsflyerDeviceId,
  });
}
