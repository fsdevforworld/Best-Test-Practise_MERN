import logger from '../../lib/logger';

import { Advance } from '../../models';
import * as analyticsClient from '../../services/analytics/client';

/*
 * Send a notification that an advance disbursement has been recorded
 */
export async function sendDisburseCompleted(advanceId: number) {
  const advance = await Advance.findByPk(advanceId);
  await analyticsClient.track({
    userId: String(advance.userId),
    event: 'advance disburse completed',
    properties: { amount: advance.amount },
  });
}

export async function sendAdvanceDisbursementFailed(advance: Advance) {
  const [user, traits] = await Promise.all([advance.getUser(), advance.getUserAttributes()]);

  if (!user) {
    logger.error('Failed to send advance disbursement failed alert', {
      userId: advance.userId,
    });
    return;
  }

  await analyticsClient.track({
    userId: String(advance.userId),
    event: 'advance disburse failed',
    context: { traits },
  });
}
