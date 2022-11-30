import { Moment } from 'moment';
import braze from '../../lib/braze';
import { dogstatsd } from '../../lib/datadog-statsd';
import { ForbiddenError, NotFoundError } from '../../lib/error';
import { moment } from '@dave-inc/time-lib';
import { AuditLog, MembershipPause, User, sequelize } from '../../models';
import { serializeDate } from '../../serialization';
import { ConstraintMessageKey, MembershipPauseMessageKey } from '../../translations';
import {
  AnalyticsEvent,
  BrazeEvent,
  BrazeUserAttributes,
  MembershipPauseResult,
} from '../../typings';
import { getForBillingCycle } from '../subscription-billing';
import logger from '../../lib/logger';
import amplitude, { EventData } from '../../lib/amplitude';

async function pause(user: User): Promise<MembershipPauseResult> {
  if (await user.hasOutstandingAdvances()) {
    throw new ForbiddenError(MembershipPauseMessageKey.OutstandingAdvancePause);
  }

  let membershipPause = await user.getCurrentMembershipPause();

  if (membershipPause?.isActive()) {
    return { success: false, msg: ConstraintMessageKey.MembershipAlreadyPaused };
  } else if (membershipPause) {
    const pauseDate = membershipPause.pausedAt.format('YYYY-MM-DD');
    return {
      success: false,
      msg: MembershipPauseMessageKey.MembershipPauseDate,
      interpolations: { pauseDate },
    };
  }
  membershipPause = await createPauseMembershipRecord(user);

  await handlePauseLogging(user.id, membershipPause);

  return {
    success: true,
    msg: `successfully paused user ${user.id}'s membership`,
    membershipPause,
  };
}

async function createPauseMembershipRecord(user: User): Promise<MembershipPause> {
  let membershipPause: MembershipPause;
  let pausedAt: Moment;
  const now = moment();
  const currentSubscriptionBilling = await getForBillingCycle(user.id, now);

  if (!currentSubscriptionBilling) {
    dogstatsd.increment('membership_pause.subscription_billing_not_found');
    logger.error('Pause membership current billing subscription not found', {
      userId: user.id,
      pausedAt,
      now,
    });
    throw new NotFoundError('System update. Please try again.');
  }

  const isPaid = await currentSubscriptionBilling.isPaid();
  const isFreeMonth = currentSubscriptionBilling.isFree();

  await sequelize.transaction(async transaction => {
    await user.update({ subscriptionFee: 0 }, { transaction });

    if (isPaid || isFreeMonth) {
      pausedAt = now
        .clone()
        .add(1, 'month')
        .startOf('month');
    } else {
      currentSubscriptionBilling.update({ amount: 0 }, { transaction });
    }
    membershipPause = await MembershipPause.create({ userId: user.id, pausedAt }, { transaction });
  });

  const analyticsEvent: EventData = {
    userId: user.id,
    eventType: AnalyticsEvent.AccountPaused,
    eventProperties: {
      is_paused_immediately: membershipPause.isActive(),
      is_free_month: isFreeMonth,
      pause_start_date: serializeDate(membershipPause.pausedAt),
    },
    userProperties: { is_paused: true },
  };

  await amplitude.track(analyticsEvent);

  return membershipPause;
}

async function handlePauseLogging(userId: number, membershipPause: MembershipPause): Promise<void> {
  const brazeEvent: BrazeEvent = {
    name: AnalyticsEvent.AccountPaused,
    externalId: `${userId}`,
    time: moment(membershipPause.created),
    properties: {
      pauseStartDate: serializeDate(membershipPause.pausedAt),
    },
  };
  const brazeAttributes: BrazeUserAttributes = { externalId: `${userId}`, isPaused: true };
  try {
    await Promise.all([
      AuditLog.create({
        userId,
        type: 'MEMBERSHIP_PAUSED',
        successful: true,
        eventUuid: membershipPause.id,
        extra: {
          pauseRecord: membershipPause,
        },
      }),
      braze.track({ attributes: [brazeAttributes], events: [brazeEvent] }),
    ]);
  } catch (e) {
    logger.error(
      'An error occured creating audit log entry or sending analytics during pause membership',
      {
        userId,
        error: e,
        membershipPause,
      },
    );
  }
}

export default pause;
