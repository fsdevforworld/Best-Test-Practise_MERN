import { UserResponse, VerificationInfoResponse } from '@dave-inc/wire-typings';
import { map } from 'lodash';
import UserHelper from '../../../helper/user';
import { User } from '../../../models';
import { serializeDate } from '../../../serialization';
import { SerializableUser, ValidVerifyNumberPayload } from './typings';

export function serializeUserResponse({
  user,
  userEmail,
  coolOffStatus,
  userIsTester,
  roles,
  userToken,
  canSignUpForBanking,
  canSignUpForBankingV2,
  isOnBankWaitlist,
  identityVerified,
  nextSubscriptionPaymentDate,
  notification,
  membershipPause,
  emailVerification,
  identityVerificationStatus,
  isBucketedIntoMxExperiment,
  requiresPasswordUpdate,
  showBanner,
}: SerializableUser): UserResponse {
  return {
    id: user.id,
    created: serializeDate(user.created),
    createdAt: serializeDate(user.createdAt),
    firstName: user.firstName,
    lastName: user.lastName,
    email: userEmail,
    externalId: user.userUlid,
    phoneNumber: user.phoneNumber,
    birthdate: serializeDate(user.birthdate),
    tester: userIsTester,
    roles,
    token: userToken,
    settings: user.settings,
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    state: user.state,
    zipCode: user.zipCode,
    defaultBankAccountId: user.defaultBankAccountId,
    emailVerified: user.emailVerified,
    profileImage: user.profileImage,
    licenseImage: user.licenseImage,
    secondaryEmail: user.secondaryEmail,
    coolOffStatus: coolOffStatus
      ? {
          coolOffDate: serializeDate(coolOffStatus.coolOffDate),
          isCoolingOff: coolOffStatus.isCoolingOff,
        }
      : undefined,
    identityVerified,
    nextSubscriptionPaymentDate,
    usedTwoMonthsFree: serializeDate(user.usedTwoMonthsFree),
    notification: map(notification, x => x.serialize()),
    emailVerification: emailVerification ? emailVerification.serialize() : null,
    hasPassword: Boolean(user.password),
    identityVerificationStatus,
    canSignUpForBanking,
    canSignUpForBankingV2,
    isOnBankWaitlist,
    membershipPause: membershipPause ? membershipPause.serialize() : null,
    isBucketedIntoMxExperiment,
    requiresPasswordUpdate,
    showBanner,
  };
}

export async function serializeVerificationInfoResponse(
  user: User,
  { isSignUp, forgotPassword }: Partial<ValidVerifyNumberPayload>,
): Promise<VerificationInfoResponse> {
  let response: VerificationInfoResponse = { isNewUser: true };

  if (user) {
    UserHelper.checkIfIsRecentlyDeletedUser(user);

    if (user.isActive()) {
      response = await UserHelper.getVerificationInfo(user, isSignUp, forgotPassword);
    }
  }

  return response;
}
