import { Op } from 'sequelize';
import { BroadcastAdvanceTipChangedPayload } from '../data';
import amplitude from '../../lib/amplitude';
import { AppsFlyerEvents, logAppsflyerEvent } from '../../lib/appsflyer';
import braze from '../../lib/braze';
import { Advance, AdvanceTip } from '../../models';

export async function broadcastAdvanceTipChanged({
  advanceId,
  amount,
  appsflyerDeviceId,
  ip,
  platform,
}: BroadcastAdvanceTipChangedPayload): Promise<void> {
  const advance = await Advance.findOne({
    where: { id: advanceId, outstanding: { [Op.gt]: 0 } },
    include: [AdvanceTip],
  });

  if (!advance) {
    return;
  }

  const [oldestUnpaidAdvance, userAttributes] = await Promise.all([
    Advance.findOne({
      where: { userId: advance.userId, outstanding: { [Op.gt]: 0 }, paybackFrozen: false },
      order: [['paybackDate', 'ASC']],
    }),
    advance.getUserAttributes(),
  ]);

  if (advance.id !== oldestUnpaidAdvance.id) {
    // Aside from purchase "events", analytics is only concerned with
    // the oldest at any given time.
    return;
  }

  const brazeUserAttributes = {
    ...userAttributes,
    externalId: `${advance.userId}`,
  };

  const identifyData = {
    user_id: `${advance.userId}`,
    user_properties: {
      $set: userAttributes,
    },
  };

  const eventName = AppsFlyerEvents.ADVANCE_TIP_REVENUE_UPDATED;
  const eventValue = JSON.stringify({ af_revenue: amount.toFixed(2) });

  const appsflyerEvent = logAppsflyerEvent({
    appsflyerDeviceId,
    eventName,
    eventValue,
    ip,
    platform,
    userId: advance.userId,
  });

  await Promise.all([
    braze.track({
      attributes: [brazeUserAttributes],
    }),
    amplitude.identify(identifyData),
    appsflyerEvent,
  ]);
}
