import ErrorHelper from '@dave-inc/error-helper';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { BankingDataSource, UserRole } from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { isNil, isString, pick, toLower, difference } from 'lodash';
import { BankConnectionSourceExperiment } from '../../../domain/experiment';
import Constants from '../../../domain/synapsepay/constants';
import { updateFromUserSettings } from '../../../domain/user-notification';
import * as EmailVerificationHelper from '../../../helper/email-verification';
import UserHelper, { verifyUserIdentity } from '../../../helper/user';
import { dogstatsd } from '../../../lib/datadog-statsd';
import {
  ConflictError,
  CUSTOM_ERROR_CODES,
  InvalidCredentialsError,
  InvalidParametersError,
  NotFoundError,
  UnauthenticatedError,
  UnauthorizedError,
} from '../../../lib/error';
import { decode } from '../../../lib/jwt';
import {
  deepTrim,
  getParams,
  minVersionCheckFromRequest,
  toE164,
  validateEmail,
  validateLastFourSSNFormat,
  validatePhoneNumber,
} from '../../../lib/utils';
import { EmailVerification, User, UserNotification } from '../../../models';
import {
  ConflictMessageKey,
  ConstraintMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  RateLimitMessageKey,
} from '../../../translations';
import { IDaveRequest, UserUpdateFields } from '../../../typings';
import { checkIpRateLimit } from './check-ip-rate-limit';
import {
  checkRateLimit,
  createRateLimiter,
  getRemainingLoginAttemptsFromDeviceId,
  loginRateLimitRules,
  passwordRecoveryRateLimitRules,
  RateLimitValues,
  loginRateLimitKey,
} from './rate-limit';
import {
  SerializableUser,
  ValidChangePasswordPayload,
  ValidCreateUserPayload,
  ValidLoginPayload,
  ValidUpdateEmailPasswordPayload,
  ValidUpdateNamePayload,
  ValidVerifyAddressInfoPayload,
  ValidVerifyBankSSNPayload,
  ValidVerifyNumberPayload,
} from './typings';
import { uploadUserProfileImage } from './profile-image-uploader';

const bankResetPasswordRateLimiter = createRateLimiter(
  'bank-reset-password-verify-code',
  passwordRecoveryRateLimitRules,
);
const resetPasswordRateLimiter = createRateLimiter(
  'reset-password',
  passwordRecoveryRateLimitRules,
);

export async function validateResetPasswordVerifyCodeRequest(req: IDaveRequest): Promise<User> {
  const { code, token } = getParams(req.body, ['code', 'token']);
  const userId = getUserIdFromToken(token);
  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError(NotFoundMessageKey.UserNotFound, { interpolations: { userId } });
  }

  const rateLimitValues = { userId: `${user.id}`, deviceId: req.get('X-Device-Id'), ip: req.ip };
  await checkRateLimit({
    rateLimiter: bankResetPasswordRateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyFailedCodeVerificationAttemptsTryLater,
    prefix: bankResetPasswordRateLimiter.key,
    ip: req.ip,
  });

  const hasDaveBanking = await user.hasDaveBanking();
  if (!hasDaveBanking) {
    dogstatsd.increment('user.reset_password.bank.verify_code.user_not_dave_banking');
    throw new NotFoundError(NotFoundMessageKey.DaveBankingUserNotFound, {
      interpolations: { userId },
    });
  }

  const validated = await UserHelper.validateVerificationCode(toE164(user.phoneNumber), code);
  if (!validated) {
    dogstatsd.increment('user.reset_password.bank.verify_code.invalid_verifcation_code');
    throw new InvalidCredentialsError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
      name: 'invalid_code',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }
  return user;
}

function getUserIdFromToken(token: string): string {
  let userId: string;
  try {
    userId = decode(token).userId;
    return userId;
  } catch (error) {
    if (error.message === 'Not enough or too many segments') {
      dogstatsd.increment('user.reset_password.bank.verify_code.token_decode_failed');
    } else if (error.message === 'Token expired') {
      dogstatsd.increment('user.reset_password.bank.verify_code.token_expired');
    }

    const formattedError = ErrorHelper.logFormat(error);
    throw new InvalidCredentialsError(InvalidParametersMessageKey.TokenExpired, {
      name: 'reset_password_token_expired',
      customCode: CUSTOM_ERROR_CODES.USER_RESET_PASSWORD_TOKEN_EXPIRED,
      data: formattedError,
    });
  }
}

export async function validateResetPasswordRequest(req: IDaveRequest): Promise<User> {
  const { email, phoneNumber } = getParams(req.body, [], ['email', 'phoneNumber']);
  if (!email && !phoneNumber) {
    throw new InvalidParametersError(InvalidParametersMessageKey.MissingEmailOrPhoneNumber);
  }

  if (email && !validateEmail(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  if (phoneNumber && !validatePhoneNumber(phoneNumber)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidPhoneNumberEntry);
  }

  const user = await User.findOneByPhoneNumberOrEmail({ phoneNumber, email });

  const deviceId = req.get('X-DEVICE-ID');
  const { ip } = req;
  const rateLimitValues: RateLimitValues = { deviceId, ip };
  if (user) {
    rateLimitValues.userId = `${user.id}`;
  }
  await checkRateLimit({
    rateLimiter: resetPasswordRateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyRequests,
    prefix: resetPasswordRateLimiter.key,
    ip,
  });

  return user;
}

export async function validateUpdateNameRequest(
  req: IDaveRequest,
): Promise<ValidUpdateNamePayload> {
  const { birthdate, firstName, lastName } = getParams(req.body, [
    'birthdate',
    'firstName',
    'lastName',
  ]);
  const license = req.file;
  const user = req.user;

  const hasDaveBanking = await user.hasDaveBanking();
  if (hasDaveBanking) {
    dogstatsd.increment('user.update_name.validate_request.bank_user_failure');
    throw new UnauthorizedError(ConstraintMessageKey.BankUserNameUpdate, {
      customCode: CUSTOM_ERROR_CODES.USER_DENY_NAME_CHANGE,
    });
  }

  if (!license) {
    dogstatsd.increment('user.update_name.validate_request.no_license_failure');
    throw new InvalidParametersError(InvalidParametersMessageKey.NoImageProvided);
  }

  if (!Constants.licenseMimetypes.includes(license.mimetype)) {
    dogstatsd.increment('user.update_name.validate_request.license_mimes_failure');
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidImageType);
  }

  const formattedBirthdate = moment(birthdate).format(MOMENT_FORMATS.YEAR_MONTH_DAY);
  if (!moment(formattedBirthdate, MOMENT_FORMATS.YEAR_MONTH_DAY).isValid()) {
    dogstatsd.increment('user.update_name.validate_request.valid_birthday_failure');
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidBirthdate);
  }

  return {
    birthdate: moment(formattedBirthdate, MOMENT_FORMATS.YEAR_MONTH_DAY),
    firstName,
    lastName,
    licenseFile: license,
  };
}

export async function validateNewUserRequest(req: IDaveRequest): Promise<ValidCreateUserPayload> {
  const { phoneNumber, code, email, password, firstName, lastName, mfaCode } = req.body;

  const deviceId: string = req.get('X-Device-Id');
  const deviceType: string = req.get('X-Device-Type');
  const appsflyerDeviceId: string = req.get('X-AppsFlyer-ID');

  const verificationCode = code || mfaCode;

  if (!phoneNumber || !verificationCode) {
    throw new InvalidParametersError(null, {
      required: ['phoneNumber', 'code'],
      provided: Object.keys(req.body),
    });
  }

  if (email && !validateEmail(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  const rateLimitValues = { phoneNumber: phoneNumber.toString(), deviceId };
  const prefix = 'create-user';
  const rateLimiter = createRateLimiter(prefix, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyFailedCodeVerificationAttemptsTryLater,
    prefix,
    ip: req.ip,
  });

  const validated = await UserHelper.validateVerificationCode(
    toE164(phoneNumber),
    verificationCode,
  );
  if (!validated) {
    dogstatsd.increment('user.attempted_signup_with_incorrect_code', {
      method: 'create',
    });
    throw new InvalidCredentialsError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
      name: 'invalid_code',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }

  return {
    phoneNumber,
    deviceId,
    deviceType,
    appsflyerDeviceId,
    email,
    password,
    firstName,
    lastName,
  };
}

export async function validateAndParseGetUserRequest(req: IDaveRequest): Promise<SerializableUser> {
  const deviceId = req.get('X-Device-Id');
  const deviceType = req.get('X-Device-Type');
  const { user } = req;
  let userToken: string | undefined;
  if (isNil(req.userToken) && isString(deviceId) && isString(deviceType)) {
    const res = await user.getSession(deviceId, deviceType, false);
    if (!isNil(res)) {
      userToken = res.token;
    }
  } else {
    userToken = req.userToken;
  }

  const [
    coolOffStatus,
    nextSubscriptionPaymentDate,
    roles,
    notification,
    emailVerification,
    { identityVerified, identityVerificationStatus },
    membershipPause,
    isBucketedIntoMxExperiment,
  ] = await Promise.all([
    UserHelper.getCoolOffStatus(req.user.id),
    UserHelper.getNextSubscriptionPaymentDate(req.user),
    req.user.getRoleNames(),
    UserNotification.findAll({ where: { userId: req.user.id } }),
    EmailVerification.latestForUser(req.user.id),
    userIdentityVerification(req.user),
    req.user.getCurrentMembershipPause(),
    BankConnectionSourceExperiment.isUserBucketed(req.user.id, BankingDataSource.Mx),
    // note 10 is the max number of promises supported in typescript es2015 so you cannot add more promises here
  ]);

  const showBanner = await UserHelper.getShowBanner(req.user.id);

  const userIsTester = roles.includes(UserRole.tester);

  let userEmail;
  if (minVersionCheckFromRequest(req, '2.7.11')) {
    // users in new version of the app only expects email to be set if it's verified
    userEmail = req.user.email;
  } else {
    // users in older version of the app expect email to be set even if it's not verified
    userEmail = req.user.email || (emailVerification && emailVerification.email);
  }

  return {
    user,
    coolOffStatus,
    userEmail,
    userIsTester,
    roles,
    userToken,
    identityVerified,
    identityVerificationStatus,
    isBucketedIntoMxExperiment,
    canSignUpForBanking: true, // Hardcoding being able to signup for banking to let everyone in
    canSignUpForBankingV2: true,
    isOnBankWaitlist: false, // Hardcoding this value as the bank waitlist is effectively dead
    notification,
    membershipPause,
    nextSubscriptionPaymentDate,
    emailVerification,
    requiresPasswordUpdate: await req.user.requiresPasswordUpdate(),
    showBanner, // should we show the temporary banner to notify users of our security breach
  };
}

export async function validateVerifyDaveBankingSSN(
  req: IDaveRequest,
): Promise<ValidVerifyBankSSNPayload> {
  const { ssnLast4, userId, recoveryEmail } = getParams(
    req.body,
    ['ssnLast4', 'userId'],
    ['recoveryEmail'],
  );
  const prefix = 'verifyBankSSN';
  const rateLimiter = createRateLimiter(prefix, [
    { interval: 24 * 60 * 60, limit: 5, precision: 3600 },
  ]);
  const rateLimitValues = { userId: `${userId}`, deviceId: req.get('X-Device-Id'), ip: req.ip };

  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyVerifyBankSSNAttemptsTryLater,
    prefix,
    ip: req.ip,
  });

  if (!validateLastFourSSNFormat(ssnLast4)) {
    dogstatsd.increment('user.verify_bank_ssn.failed.invalid_ssn_last_four_format');
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidSSNLast4Format);
  }

  const user = await User.findByPk(userId);
  if (!user) {
    dogstatsd.increment('user.verify_bank_ssn.failed.user_not_found');
    throw new NotFoundError(NotFoundMessageKey.UserNotFoundTryAgain);
  }

  const hasDaveBanking = await user.hasDaveBanking();
  if (!hasDaveBanking) {
    dogstatsd.increment('user.verify_bank_ssn.failed.user_not_dave_banking');
    throw new NotFoundError(NotFoundMessageKey.DaveBankingUserNotFoundTryAgain);
  }

  if (recoveryEmail && toLower(user.email).trim() !== toLower(recoveryEmail).trim()) {
    dogstatsd.increment('user.verify_bank_ssn.failed.user_email_recovery_email_no_match');
    throw new UnauthenticatedError();
  }

  return { ssnLast4, user, recoveryEmail };
}

export async function validateChangePasswordRequest(
  req: IDaveRequest,
): Promise<ValidChangePasswordPayload> {
  const { currentPassword, newPassword } = getParams(req.body, ['currentPassword', 'newPassword']);
  const deviceId = req.get('X-DEVICE-ID');

  if (!req.user.password) {
    dogstatsd.increment('user.change_password.has_no_existing_password');
    throw new ConflictError(ConflictMessageKey.PasswordCannotBeChanged);
  }

  const isValidated = await bcrypt.compare(currentPassword, req.user.password);
  if (!isValidated) {
    dogstatsd.increment('user.attempted_change_password_with_incorrect_password');
    throw new InvalidCredentialsError(InvalidParametersMessageKey.PasswordDoesNotMatch, {
      name: 'invalid_password',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }

  return { newPassword, deviceId };
}

export async function validateLoginRequest(req: IDaveRequest): Promise<ValidLoginPayload> {
  const {
    ip,
    body: { email, phoneNumber, password, mfaCode },
  } = req;
  const deviceId = req.get('X-Device-Id');
  const deviceType = req.get('X-Device-Type');

  const params = {
    email,
    phoneNumber,
    password,
    mfaCode,
    'X-Device-Id': deviceId,
    'X-Device-Type': deviceType,
  };
  const required = email
    ? ['email', 'password', 'X-Device-Id', 'X-Device-Type']
    : ['phoneNumber', 'password', 'X-Device-Id', 'X-Device-Type'];
  const provided = Object.entries(params)
    .filter(([key, value]) => value !== undefined)
    .map(([key, value]) => key);
  const missing = difference(required, provided);

  if (!password || !(email || phoneNumber)) {
    dogstatsd.increment('user.login_with_password.missing_params', missing);
    throw new InvalidParametersError(InvalidParametersMessageKey.PasswordAndEmailOrPhone);
  }

  await checkIpRateLimit(ip, RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater);

  if (!deviceId || !deviceType) {
    dogstatsd.increment('user.login_with_password.missing_params', missing);
    throw new InvalidParametersError(null);
  }

  const loginMethod = email ? 'email' : 'phoneNumber';

  const rateLimitValues = { email, phoneNumber, deviceId };
  const rateLimiter = createRateLimiter(loginRateLimitKey, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyFailedLoginAttemptsTryLater,
    prefix: loginRateLimitKey,
    ip,
  });
  const attemptsRemaining = await getRemainingLoginAttemptsFromDeviceId(
    rateLimitValues,
    loginRateLimitKey,
  );
  const user = await User.findOneByPhoneNumberOrEmail({ email, phoneNumber });

  if (!user) {
    dogstatsd.increment('user.login_with_password.invalid_credentials', { loginMethod });
    throw new InvalidCredentialsError('Credentials provided are invalid.', {
      name: 'invalid_credentials',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }

  return { user, password, deviceId, deviceType, loginMethod, mfaCode, attemptsRemaining };
}

export async function validatePasswordConfirmRequest(req: IDaveRequest): Promise<void> {
  const { password } = getParams(req.body, ['password']);
  const deviceId = req.get('X-Device-Id');
  const rateLimitValues = { phoneNumber: req.user.phoneNumber, deviceId };
  const prefix = 'confirm-password';
  const rateLimiter = createRateLimiter(prefix, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    prefix,
    errorMessage: RateLimitMessageKey.TooManyFailedPasswordConfirmAttemptsTryLater,
    ip: req.ip,
  });

  const isValidated = await bcrypt.compare(password, req.user.password);
  if (!isValidated) {
    dogstatsd.increment('user.password_confirm_failed');
    throw new InvalidCredentialsError(InvalidParametersMessageKey.PasswordDoesNotMatch, {
      name: 'invalid_password',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }
}

export function validateVerifyAddressInfo(req: IDaveRequest): ValidVerifyAddressInfoPayload {
  const { addressLine1, addressLine2, city, state, zipCode } = getParams(
    req.body,
    ['addressLine1', 'city', 'state', 'zipCode'],
    ['addressLine2'],
  );

  return { addressLine1, addressLine2, city, state, zipCode };
}

/**
 * This function is used for two different endpoints:
 * 1. Requires a token in the url params
 * 2. Does not require a token in the url params, but does go through requireAuth
 * Regardless, both ways securely authenticates the request to this function
 */
export async function validateSetEmailPasswordRequest(
  req: IDaveRequest,
): Promise<ValidUpdateEmailPasswordPayload> {
  // This endpoint is used to set just password or both email and password
  // Because of the first case, email is an optional part of the body
  const { password, email } = getParams(req.body, ['password'], ['email']);

  // note we are just checking the new email address that the user is changeing to
  if (email && !validateEmail(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  const deviceId = req.get('X-DEVICE-ID');
  let user = req.user;
  if (req.params.token) {
    try {
      user = await UserHelper.getUserByToken(req.params.token);
    } catch (err) {
      throw new InvalidCredentialsError(InvalidParametersMessageKey.LinkExpired);
    }
  }

  if (!user) {
    throw new InvalidCredentialsError(NotFoundMessageKey.UserNotFoundTryAgain);
  }

  return { deviceId, email, password, user };
}

export async function validateUpdateUserRequest(req: IDaveRequest): Promise<UserUpdateFields> {
  const body = deepTrim(req.body);
  const {
    defaultBankAccountId,
    email,
    fcmToken,
    profileImage,
    secondaryEmail,
    settings,
    skipAddressVerification,
  } = body;

  const initPayload: UserUpdateFields = defaultBankAccountId ? { defaultBankAccountId } : {};

  const validatedPayload: UserUpdateFields = await UserHelper.validateParams(
    req.user,
    body,
    initPayload,
    skipAddressVerification,
  );

  if (fcmToken !== undefined) {
    validatedPayload.fcmToken = fcmToken;
  }
  if (secondaryEmail !== undefined) {
    validatedPayload.secondaryEmail = secondaryEmail;
  }

  await EmailVerificationHelper.attemptCreateAndSendEmailVerification({
    id: req.user.id,
    newEmail: email,
    oldEmail: req.user.email,
  });

  const fields = [
    'default_tip',
    'default_account',
    'advance_tutorial_seen',
    'institution_notify_query',
    'low_balance_alert',
    'push_notifications_enabled',
    'sms_notifications_enabled',
    'target_spend',
    'paid_with_direct_deposit',
    'credit_score_range',
    'unemployment_reason',
    'hide_side_hustle',
  ];
  const requestSettings = pick(settings, fields);

  // Organically backfill 'user_notification' and 'notification' tables for custom configuration.
  if (requestSettings) {
    await updateFromUserSettings(req.user.id, requestSettings);
    validatedPayload.settings = Object.assign({}, req.user.settings, requestSettings);
  }

  if (profileImage) {
    validatedPayload.profileImage = await uploadUserProfileImage(profileImage);
  }

  return validatedPayload;
}

const verifyNumberRateLimiter = createRateLimiter('verify-number', loginRateLimitRules);

export const validateVerifyNumberRequest = async (
  req: Request,
): Promise<ValidVerifyNumberPayload> => {
  const payload: ValidVerifyNumberPayload = getParams(
    req.body,
    ['phoneNumber'],
    ['isSignUp', 'forgotPassword'],
  );
  const rateLimitValues: RateLimitValues = {
    deviceId: req.get('X-DEVICE-ID'),
    ip: req.ip,
    phoneNumber: payload.phoneNumber,
  };

  await checkRateLimit({
    rateLimiter: verifyNumberRateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManyRequests,
    prefix: verifyNumberRateLimiter.key,
    ip: req.ip,
  });

  return payload;
};

async function userIdentityVerification(user: User) {
  let identityVerified = false;
  let identityVerificationStatus;

  try {
    const result = await verifyUserIdentity(user, {
      isAdmin: false,
      auditLog: false,
    });
    identityVerified = result.success;
    identityVerificationStatus = result.status;
  } catch (err) {}

  return { identityVerified, identityVerificationStatus };
}

export async function validateVerifyCodeRequest(req: IDaveRequest): Promise<string> {
  const { phoneNumber, code } = getParams(req.body, ['phoneNumber', 'code']);
  const deviceId: string = req.get('X-Device-Id');

  const rateLimitValues = { phoneNumber: phoneNumber.toString(), deviceId };
  const prefix = 'verify-code';
  const rateLimiter = createRateLimiter(prefix, loginRateLimitRules);
  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    prefix,
    errorMessage: RateLimitMessageKey.TooManyFailedCodeVerificationAttemptsTryLater,
    ip: req.ip,
  });

  const validated = await UserHelper.validateVerificationCode(toE164(phoneNumber), code);
  if (!validated) {
    dogstatsd.increment('user.attempted_signup_with_incorrect_code', {
      method: 'verifyCode',
    });
    throw new InvalidCredentialsError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
      name: 'invalid_code',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }

  return phoneNumber;
}
