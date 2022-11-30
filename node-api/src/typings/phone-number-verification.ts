export type PhoneNumberVerification = {
  carrierName: string;
  code: string;
  carrierCode: string;
  sendCount?: number;
};

export enum PhoneNumberVerificationDeliveryMethod {
  SMS = 'sms',
  EMAIL = 'email',
  EMAIL_TO_SMS = 'email_to_sms',
}

export type MobileInfo = {
  isMobile: boolean;
  carrierName: string;
  carrierCode: string;
};
