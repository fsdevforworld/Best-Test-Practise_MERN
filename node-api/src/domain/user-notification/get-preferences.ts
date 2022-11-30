import { UserNotification, Notification } from '../../models';

export async function getPreferences(userId: number) {
  const all = await UserNotification.findAll({
    where: { userId },
    include: [Notification],
  });
  return {
    push_enabled: all.filter(un => un.pushEnabled).map(un => un.notification.type),
    sms_enabled: all.filter(un => un.smsEnabled).map(un => un.notification.type),
    email_enabled: all.filter(un => un.emailEnabled).map(un => un.notification.type),
  };
}
