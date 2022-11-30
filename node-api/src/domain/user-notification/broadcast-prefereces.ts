import * as analyticsClient from '../../services/analytics/client';
import { getPreferences } from './get-preferences';

export async function broadcastPreferences(userId: number) {
  const traits = await getPreferences(userId);
  await analyticsClient.track({
    event: 'user notification updated',
    userId: String(userId),
    context: { traits },
  });
}
