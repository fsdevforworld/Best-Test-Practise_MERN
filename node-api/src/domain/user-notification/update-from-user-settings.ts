import * as Bluebird from 'bluebird';
import { pick, isEmpty } from 'lodash';

import { Notification, UserNotification } from '../../models';
import { NotificationType } from '../../models/notification';
import { UserSettings } from '../../typings';

import { broadcastMarketingSMSEnabled } from './broadcast-marketing-sms-enabled';
import { broadcastPreferences } from './broadcast-prefereces';
import { hasMarketingSMSEnabled } from './has-marketing-sms-enabled';

export async function updateFromUserSettings(userId: number, settings: UserSettings) {
  if (!hasSettings(settings)) {
    return;
  }
  const hasMarketing = await hasMarketingSMSEnabled(userId);
  const notifications = await Notification.findAll();
  const upsert = notifications.map(
    async (notification: Notification): Promise<UserNotification> => {
      const isLowBalance = notification.type === NotificationType.LOW_BALANCE;
      const data = {
        smsEnabled: settings.sms_notifications_enabled,
        pushEnabled: settings.push_notifications_enabled,
        threshold: isLowBalance ? settings.low_balance_alert : null,
      };

      const [userNotification, created] = await UserNotification.findOrCreate({
        where: {
          userId,
          notificationId: notification.id,
        },
        defaults: data,
      });

      if (!created && isLowBalance) {
        return userNotification.update(data);
      }
    },
  );
  await Bluebird.all<UserNotification>(upsert);

  // broadcast settings to braze
  if (!hasMarketing && settings.sms_notifications_enabled) {
    await broadcastMarketingSMSEnabled(userId);
  }
  await broadcastPreferences(userId);
}

export function hasSettings(userSettings: UserSettings) {
  const notificationFields = [
    'low_balance_alert',
    'push_notifications_enabled',
    'sms_notifications_enabled',
  ];
  const settings = pick(userSettings, notificationFields);
  return !isEmpty(settings);
}
