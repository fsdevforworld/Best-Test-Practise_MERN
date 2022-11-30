import ErrorHelper from '@dave-inc/error-helper';
import * as Bluebird from 'bluebird';
import { isNil } from 'lodash';
import logger from '../../lib/logger';
import { FraudAlert, User } from '../../models';
import { FraudAlertReason } from '../../typings';

export type UserEventCount = {
  userId: number;
  eventCount: number;
};

async function flagFraudulentUser(
  userId: number,
  reason: FraudAlertReason,
  extra?: object,
): Promise<boolean> {
  const user = await User.findByPk(userId);

  if (user.fraud) {
    // Ensure user is not already flagged for the
    // given reason
    const existing = await FraudAlert.findOne({
      where: { userId, reason },
    });
    if (!isNil(existing)) {
      return false;
    }
  }

  await FraudAlert.createFromUserAndReason(user, reason, extra);
  return true;
}

async function flagFraudulentUserByEventCount(
  userEventCount: UserEventCount,
  reason: FraudAlertReason,
): Promise<void> {
  try {
    const flagged = await flagFraudulentUser(userEventCount.userId, reason, {
      count: userEventCount.eventCount,
    });
    if (flagged) {
      logger.info('Flagged user with too many suspicious events', {
        ...userEventCount,
        reason,
      });
    }
  } catch (error) {
    const formatted = ErrorHelper.logFormat(error);
    logger.error('Error flagging fraudulent user', {
      error: formatted,
      user: userEventCount.userId,
      reason,
    });
  }
}

export async function flagEventCountViolations(
  userEventCounts: Promise<UserEventCount[]> | UserEventCount[],
  reason: FraudAlertReason,
  concurrency: number = 10,
): Promise<void> {
  const results = await Bluebird.map(
    userEventCounts,
    userEventCount => flagFraudulentUserByEventCount(userEventCount, reason),
    { concurrency },
  );
  logger.info(`Flagged ${results.length} users with fraud reason ${reason}`);
}

export default {
  flagEventCountViolations,
};
