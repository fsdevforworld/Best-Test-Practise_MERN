import { UserNotification } from '../../src/models';

export default function(factory: any) {
  factory.define('user-notification', UserNotification, {
    userId: factory.assoc('user', 'id'),
    notificationId: 1,
    pushEnabled: true,
    smsEnabled: true,
    emailEnabled: true,
  });

  factory.define('auto-approval-notification', UserNotification, {
    userId: factory.assoc('user', 'id'),
    notificationId: 1, // See migration: 20190308214528-PopulateNotificationTable
  });

  factory.extend('auto-approval-notification', 'low-balance-notification', {
    notificationId: 2, // See migration: 20190308214528-PopulateNotificationTable
  });
}
