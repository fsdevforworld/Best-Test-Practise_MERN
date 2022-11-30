import * as analyticsClient from '../../services/analytics/client';

export async function broadcastMarketingSMSEnabled(userId: number) {
  await analyticsClient.track({
    event: 'marketing sms enabled',
    userId: String(userId),
  });
}
