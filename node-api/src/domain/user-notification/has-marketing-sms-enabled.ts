import { Op } from 'sequelize';
import { UserNotification } from '../../models';

import { NotificationTypes } from './types';

export async function hasMarketingSMSEnabled(userId: number) {
  const notification = await UserNotification.findOne({
    where: {
      userId,
      notificationId: { [Op.in]: MARKETING_IDS },
      smsEnabled: true,
    },
  });
  return Boolean(notification);
}

export function isMarketingType(notificationTypeId: number) {
  return MARKETING_IDS.includes(notificationTypeId);
}

const MARKETING_IDS = [
  NotificationTypes.NEWSLETTER,
  NotificationTypes.PRODUCT_ANNOUNCEMENTS,
  NotificationTypes.SPECIAL_OFFERS,
];
