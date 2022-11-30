export type UserNotificationParams = {
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  threshold?: number;
};

export enum NotificationTypes {
  AUTO_ADVANCE_APPROVAL = 1,
  LOW_BALANCE = 2,
  SPECIAL_OFFERS = 3,
  PRODUCT_ANNOUNCEMENTS = 4,
  NEWSLETTER = 5,
}
