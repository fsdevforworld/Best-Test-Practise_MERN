import { Moment } from '@dave-inc/time-lib';
import { IdentityVerificationStatus, UserRole } from '@dave-inc/wire-typings';
import { EmailVerification, MembershipPause, User, UserNotification } from '../../../models';
import { CooloffStatus } from '../../../typings';

export type SerializableUser = {
  user: User;
  userEmail: string;
  coolOffStatus: CooloffStatus;
  userIsTester: boolean;
  roles: UserRole[];
  userToken: string;
  canSignUpForBanking: boolean;
  canSignUpForBankingV2: boolean;
  isOnBankWaitlist: boolean;
  identityVerified: boolean;
  nextSubscriptionPaymentDate: string;
  notification: UserNotification[];
  membershipPause: MembershipPause;
  emailVerification: EmailVerification;
  identityVerificationStatus: IdentityVerificationStatus;
  isBucketedIntoMxExperiment: boolean;
  requiresPasswordUpdate: boolean;
  showBanner: boolean;
};

export type UserLoginResult = UserCreateResult & { loginMethod: string };

export type UserCreateResult = {
  user: User;
  userToken: string;
  deviceId: string;
  deviceType: string;
  created?: Date;
};

export type ValidCreateUserPayload = {
  phoneNumber: string;
  deviceId: string;
  deviceType: string;
  appsflyerDeviceId: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
};

export type ValidUpdateEmailPasswordPayload = {
  deviceId: string;
  email: string;
  password: string;
  user: User;
};

export type ValidChangePasswordPayload = {
  newPassword: string;
  deviceId: string;
};

export type ValidDeleteUserPayload = {
  id: number;
  reason: string;
  additionalInfo: any; // add type in future PR, not in a refactor PR that should preserve the same behavior
};

export type ValidLoginPayload = {
  user: User;
  password: string;
  deviceId: string;
  deviceType: string;
  loginMethod: string;
  mfaCode?: string;
  attemptsRemaining: number;
};

export type ValidVerifyBankSSNPayload = {
  ssnLast4: string;
  user: User;
  recoveryEmail?: string;
};

export type ValidSendCodePayload = { phoneNumber: string; email?: string | null };

export type ValidVerifyAddressInfoPayload = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
};

export type ValidUpdateNamePayload = {
  firstName: string;
  lastName: string;
  birthdate: Moment;
  licenseFile: Express.Multer.File;
};

export type ValidVerifyNumberPayload = {
  phoneNumber: string;
  isSignUp: boolean;
  forgotPassword: boolean;
};

export type VerifyNumberOrSendVerificationPayload = {
  phoneNumber: string;
  verificationCodeOnly: boolean;
  isSignUp: boolean;
};
