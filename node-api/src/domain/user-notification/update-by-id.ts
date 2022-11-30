import { hasMarketingSMSEnabled } from './has-marketing-sms-enabled';
import { broadcast } from './broadcast';
import { isMarketingType } from './has-marketing-sms-enabled';
import { UserNotificationParams } from './types';
import { UserNotification } from '../../models';

export async function updateById(userId: number, id: number, params: UserNotificationParams) {
  const beforeSMSEnabled = await hasMarketingSMSEnabled(userId);
  const userNotification = await UserNotification.findByPk(id);
  await userNotification.update(params);
  // broadcast settings to braze
  await broadcast({
    userId,
    beforeSMSEnabled,
    afterSMSEnabled: isMarketingType(userNotification.notificationId) && params?.smsEnabled,
  });
  return userNotification;
}
