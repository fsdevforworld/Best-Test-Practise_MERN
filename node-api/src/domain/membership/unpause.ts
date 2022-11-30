import amplitude, { EventData } from '../../lib/amplitude';
import braze from '../../lib/braze';
import { moment } from '@dave-inc/time-lib';
import { AuditLog, MembershipPause, User, sequelize } from '../../models';
import { serializeDate } from '../../serialization';
import { AnalyticsEvent, BrazeEvent, BrazeUserAttributes } from '../../typings';
import { resubscribe } from './resubscribe';
import logger from '../../lib/logger';

async function unpause(user: User): Promise<void> {
  const membershipPause = await user.getCurrentMembershipPause();

  if (membershipPause) {
    await sequelize.transaction(async transaction => {
      await resubscribe(user, transaction);

      await membershipPause.update(
        {
          unpausedAt: moment(),
        },
        { transaction },
      );
    });
    // handles case where unpausedAt has milliseconds when returned from updating the model.
    // So we reload the model and it removes the milleseconds from unpausedAt.
    await membershipPause.reload();
    await handleLogging(user.id, membershipPause);
  }
}

async function handleLogging(userId: number, membershipPause: MembershipPause): Promise<void> {
  const amplitudeEvent: EventData = {
    userId,
    eventType: AnalyticsEvent.AccountUnpaused,
    eventProperties: { pause_end_date: serializeDate(membershipPause.unpausedAt) },
    userProperties: { is_paused: false },
  };
  const brazeEvent: BrazeEvent = {
    name: AnalyticsEvent.AccountUnpaused,
    externalId: `${userId}`,
    time: membershipPause.unpausedAt,
  };
  const brazeAttributes: BrazeUserAttributes = { externalId: `${userId}`, isPaused: false };
  try {
    await Promise.all([
      amplitude.track(amplitudeEvent),
      braze.track({ attributes: [brazeAttributes], events: [brazeEvent] }),
      AuditLog.create({
        userId,
        type: 'MEMBERSHIP_UNPAUSED',
        successful: true,
        eventUuid: membershipPause.id,
        extra: {
          pauseRecord: membershipPause,
        },
      }),
    ]);
  } catch (e) {
    logger.error(
      'An error occured creating audit log entry or sending analytics during unpause membership',
      {
        userId,
        error: e,
        membershipPause,
      },
    );
  }
}

export default unpause;
