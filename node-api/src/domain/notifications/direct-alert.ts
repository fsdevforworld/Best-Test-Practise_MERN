import amplitude from '../../lib/amplitude';
import { moment } from '@dave-inc/time-lib';
import twilio from '../../lib/twilio';

import { Alert, AuditLog, User } from '../../models';
import logger from '../../lib/logger';

//const CONTACT_URL = 'https://dave.com/dave-contact.vcf';
export const SEND_LIMIT_ONCE = 'once';
export const SEND_LIMIT_DAILY = 'daily';

/*
 * Alerts
 */

export async function create(
  type: string,
  subtype: string,
  message: string,
  userId: number,
  eventUuid: string | number,
  eventType: string = undefined,
) {
  const alert = await Alert.create({
    type,
    subtype,
    userId,
    eventUuid,
    eventType,
  });

  await AuditLog.create({
    userId,
    type: 'ALERT_SENT',
    message: `${type}:${subtype}`,
    successful: true,
    eventUuid: alert.id,
    extra: {
      event: eventUuid,
    },
  });

  await amplitude.track({
    userId,
    eventType: `${subtype} sent`,
    eventProperties: {
      type,
      message,
      event_uuid: eventUuid,
      event_type: eventType,
    },
  });

  return alert;
}

export async function sendSMS(
  userId: number,
  subtype: string,
  eventUuid: string | number,
  eventType: string,
  message: string,
  mediaUrl?: string,
  sendLimit?: 'once' | 'daily',
) {
  const user: User = await User.findByPk(userId);
  if (!user) {
    logger.error('Failed to send SMS: user not found', {
      message: userId,
    });
    return;
  }
  if (await _isBelowSendLimit('SMS', subtype, user.id, eventUuid, sendLimit)) {
    await _sendSMSToUser(user, subtype, eventUuid, eventType, message, mediaUrl);
  }
}

async function _sendSMSToUser(
  user: User,
  subtype: string,
  eventUuid: string | number,
  eventType: string,
  message: string,
  mediaUrl: string,
) {
  if (user.unsubscribed) {
    logger.info('Skipping alert text, user has unsubscribed', { userId: user.id, subtype });
    return;
  }
  await create('SMS', subtype, message, user.id, eventUuid, eventType);
  await twilio.send(message, user.phoneNumber, mediaUrl);
}

async function _isBelowSendLimit(
  type: string | string[],
  subtype: string,
  userId: number,
  eventUuid: string | number,
  sendLimit: 'once' | 'daily',
) {
  if (!sendLimit) {
    return true;
  }

  const alerts = await Alert.findAll({
    where: {
      type,
      subtype,
      userId,
      eventUuid,
    },
  });

  if (sendLimit === SEND_LIMIT_ONCE && alerts.length) {
    return false;
  }

  const yesterday = moment().subtract(1, 'day');
  const recentAlert = alerts.some(alert => {
    return alert.created > yesterday;
  });

  if (sendLimit === SEND_LIMIT_DAILY && recentAlert) {
    return false;
  }

  return true;
}
