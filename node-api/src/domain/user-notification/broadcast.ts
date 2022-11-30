import { broadcastMarketingSMSEnabled } from './broadcast-marketing-sms-enabled';
import { broadcastPreferences } from './broadcast-prefereces';

export async function broadcast({
  userId,
  beforeSMSEnabled,
  afterSMSEnabled,
}: {
  userId: number;
  beforeSMSEnabled: boolean;
  afterSMSEnabled: boolean;
}) {
  if (!beforeSMSEnabled && afterSMSEnabled) {
    return Promise.all([broadcastMarketingSMSEnabled(userId), broadcastPreferences(userId)]);
  }
  return broadcastPreferences(userId);
}
