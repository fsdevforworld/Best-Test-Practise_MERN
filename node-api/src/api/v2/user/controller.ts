import ErrorHelper from '@dave-inc/error-helper';
import { moment } from '@dave-inc/time-lib';
import { VerificationInfoResponse } from '@dave-inc/wire-typings';
import * as config from 'config';
import getClient from '../../../domain/bank-of-dave-internal-api';
import * as BankingDataSync from '../../../domain/banking-data-sync';
import { BankConnectionSourceExperiment } from '../../../domain/experiment';
import * as SynapsePay from '../../../domain/synapsepay';
import { aggregateBroadcastCalls, broadcastPasswordUpdate } from '../../../domain/user-updates';
import * as EmailVerificationHelper from '../../../helper/email-verification';
import UserHelper from '../../../helper/user';
import * as Jobs from '../../../jobs/data';
import amplitude from '../../../lib/amplitude';
import { logAppsflyerEvent, AppsFlyerEvents } from '../../../lib/appsflyer';
import braze from '../../../lib/braze';
import { dogstatsd } from '../../../lib/datadog-statsd';
import {
  CUSTOM_ERROR_CODES,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidParametersError,
  SendgridEmailError,
  UnauthorizedError,
  UnauthenticatedError,
} from '../../../lib/error';
import logger from '../../../lib/logger';
import { toE164, updateAndGetModifications } from '../../../lib/utils';
import { AuditLog, User, UserSession } from '../../../models';
import {
  FailureMessageKey,
  InvalidCredentialsMessageKey,
  InvalidParametersMessageKey,
} from '../../../translations';
import { AnalyticsEvent, BooleanValue, UserUpdateFields, Platforms } from '../../../typings';
import { flagTooManyUsersOnDevice } from './helpers';
import {
  UserCreateResult,
  UserLoginResult,
  ValidChangePasswordPayload,
  ValidCreateUserPayload,
  ValidLoginPayload,
  ValidUpdateEmailPasswordPayload,
  ValidUpdateNamePayload,
  VerifyNumberOrSendVerificationPayload,
} from './typings';
import * as uuid from 'uuid';

export const client = getClient();

export async function changePassword(
  user: User,
  { newPassword, deviceId }: ValidChangePasswordPayload,
): Promise<void> {
  await user.setPassword(newPassword);
  await user.save();
  dogstatsd.increment('user.attempted_change_password_success');
  await Promise.all([
    AuditLog.create({
      userId: user.id,
      type: 'RESET_PASSWORD',
      message: 'Successfully reset password.',
      successful: true,
      extra: { deviceId },
    }),
    broadcastPasswordUpdate(user.id),
  ]);
}

function handleVerifyDaveBankingSSNError(
  message: string,
  ddSuffix: string,
  user: User,
  error: Error,
) {
  const formattedError = ErrorHelper.logFormat(error);
  logger.error(message, {
    ...formattedError,
    userId: user.id,
    phoneNumber: user.phoneNumber,
  });
  dogstatsd.increment(`user.verify_bank_ssn.failed.${ddSuffix}`);
}

export async function verifyDaveBankingSSN(
  user: User,
  ssnLast4: string,
  email: string,
): Promise<void> {
  try {
    await client.verifyUser(user.id, { ssnLast4 });
  } catch (error) {
    handleVerifyDaveBankingSSNError(
      'Failed to verify last four of Dave Banking SSN.',
      'invalid_ssn_last_four',
      user,
      error,
    );

    throw new InvalidCredentialsError(InvalidCredentialsMessageKey.InvalidSSNLast4);
  }

  try {
    if (config.get('phoneNumbers.shouldSendVerificationCode')) {
      await UserHelper.sendVerificationCode({
        phoneNumber: user.phoneNumber,
        email,
        isAllowedVoip: true,
      });
    }
  } catch (error) {
    handleVerifyDaveBankingSSNError(
      'Failed to send MFA code after dave banking SSN.',
      'invalid_mfa_code',
      user,
      error,
    );

    throw new InvalidParametersError(
      'Error sending MFA code, try texting START in all caps to 96419',
    );
  }
}

export async function loginUser({
  user,
  password,
  deviceId,
  deviceType,
  loginMethod,
  mfaCode,
  attemptsRemaining,
}: ValidLoginPayload): Promise<UserLoginResult> {
  if (user.fraud) {
    throw new UnauthorizedError(InvalidParametersMessageKey.PleaseContactCustomerService);
  }

  await UserHelper.verifyUserPassword(user, password, attemptsRemaining);

  const adminLoginOverride = await UserHelper.getAdminLoginOverride(toE164(user.phoneNumber));

  // Only automatically create the session if this is an admin login override
  // or if it's the QA / Apple review user
  const shouldCreateSession = Boolean(adminLoginOverride) || user.email === 'qa@dave.com';
  let userSession = await user.getSession(deviceId, deviceType, shouldCreateSession);

  if (!userSession) {
    userSession = await mfaForNewDevice(user, {
      mfaCode,
      deviceId,
      deviceType,
      attemptsRemaining,
    });
  }
  await UserHelper.attemptToSetAdminLoginOverrideSession(userSession, user.phoneNumber, password);

  return { userToken: userSession.token, user, loginMethod, deviceId, deviceType };
}

async function mfaForNewDevice(
  user: User,
  {
    mfaCode,
    deviceType,
    deviceId,
    attemptsRemaining,
  }: {
    mfaCode: string;
    deviceType: string;
    deviceId: string;
    attemptsRemaining: number;
  },
): Promise<UserSession> {
  if (mfaCode) {
    // check mfaCode
    const e164PhoneNumber = toE164(user.phoneNumber);
    const validated = await UserHelper.validateVerificationCode(e164PhoneNumber, mfaCode);
    if (!validated) {
      dogstatsd.increment('user.attempted_login_with_incorrect_code', {
        method: 'verifyCode',
      });
      throw new InvalidCredentialsError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
        name: 'invalid_code',
        customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
        data: { attemptsRemaining },
      });
    }
    return user.getSession(deviceId, deviceType, true);
  } else {
    await UserHelper.sendNewDeviceMFACode(user);
    dogstatsd.increment('user.login_with_password.mfa_required_for_login');
    // it's OK to return the attempts remaining, phonenumber and email because we know the user submitted a valid password
    // and has not attempted to verify the MFA
    throw new InvalidCredentialsError('Verify account with MFA Code.', {
      name: 'mfa_required_for_login',
      customCode: CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN,
      data: { attemptsRemaining, phoneNumber: user.phoneNumber, email: user.email },
    });
  }
}

export async function sendResetPasswordEmail(user: User): Promise<void> {
  try {
    await UserHelper.sendResetPasswordEmail(user.email, user.firstName);
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    logger.error('error sending password reset email through sendgrid', {
      userId: user.id,
      ...formattedError,
    });
    dogstatsd.increment('user.send_reset_password_email.failed');
    throw new SendgridEmailError(FailureMessageKey.PasswordResetEmailError);
  }
}

export async function updateNameAndLicense(
  user: User,
  ip: string,
  requestPayload: ValidUpdateNamePayload,
): Promise<void> {
  const synapseFields = SynapsePay.mapToSynapseFields(requestPayload);
  await SynapsePay.upsertSynapsePayUser(user, ip, synapseFields);
  const modifications = await updateAndGetModifications(user, requestPayload);
  await Promise.all([
    UserHelper.logModifications({
      modifications,
      userId: user.id,
      type: AuditLog.TYPES.USER_PROFILE_UPDATE_NAME,
      requestPayload,
    }),
    ...aggregateBroadcastCalls({
      userId: user.id,
      modifications,
      updateFields: requestPayload,
      updateSynapse: false,
    }),
  ]);
}

export async function createUser(
  appVersion: string,
  createUserPayload: ValidCreateUserPayload,
): Promise<UserCreateResult> {
  const {
    phoneNumber,
    deviceId,
    deviceType,
    appsflyerDeviceId,
    email,
    password,
    firstName,
    lastName,
  } = createUserPayload;

  const { user, created, token } = await User.getOrCreate(
    toE164(phoneNumber),
    deviceId,
    deviceType,
    firstName,
    lastName,
  );

  if (created && email && password) {
    await updateEmailPassword({ deviceId, email, password, user });
  }

  if (user.fraud) {
    throw new InvalidCredentialsError(InvalidParametersMessageKey.PleaseContactCustomerService);
  }

  if (created) {
    await Promise.all([
      AuditLog.create({
        userId: user.id,
        type: 'USER_CREATED',
        successful: true,
        eventUuid: user.id,
      }),
      flagTooManyUsersOnDevice(user, deviceId),
      config.get('mxAtrium.experiment.active') === BooleanValue.True
        ? BankConnectionSourceExperiment.bucketUser(user.id, {
            appVersion,
            deviceType,
          }).catch(err => {
            logger.error('Failed to bucket to bank connection source experiment', { err });
            dogstatsd.increment('user.created.failed_to_bucket_bank_connection_source_experiment');
          })
        : null,
    ]);
    dogstatsd.increment('user.created');
  } else {
    dogstatsd.increment('user.logged_in');
  }

  if (created) {
    trackUserCreation(user.id, deviceType, appsflyerDeviceId);
  }

  return { user, userToken: token, deviceId, deviceType };
}

async function trackUserCreation(userId: number, deviceType: string, appsflyerDeviceId: string) {
  await Promise.all([
    braze.track({
      events: [{ name: AnalyticsEvent.UserCreated, externalId: `${userId}`, time: moment() }],
    }),
    amplitude.track({ userId, eventType: AnalyticsEvent.UserCreated }),
    logAppsflyerEvent({
      appsflyerDeviceId,
      platform: deviceType === Platforms.iOS ? Platforms.iOS : Platforms.Android,
      userId,
      eventName: AppsFlyerEvents.USER_CREATED,
    }),
  ]);
}

export async function updateUser(
  user: User,
  { requestPayload }: { requestPayload: any },
  validatedPayload: UserUpdateFields,
): Promise<void> {
  const fieldsToExclude = ['fcmToken'];
  const modifications = await updateAndGetModifications(user, validatedPayload, {
    exclusions: fieldsToExclude,
  });

  if (validatedPayload.defaultBankAccountId) {
    BankingDataSync.syncUserDefaultBankAccount(validatedPayload.defaultBankAccountId);
  }

  await Promise.all([
    Jobs.createFraudCheckTask({ userId: user.id }),
    UserHelper.logModifications({
      modifications,
      userId: user.id,
      type: AuditLog.TYPES.USER_PROFILE_UPDATE,
      requestPayload,
    }),
    ...aggregateBroadcastCalls({
      userId: user.id,
      modifications,
      updateFields: validatedPayload,
      updateSynapse: true,
    }),
  ]);
}

export async function sendVerification(phoneNumber: string, email?: string | null): Promise<void> {
  const e164PhoneNumber = toE164(phoneNumber);

  const user = await User.findOneByPhoneNumber(e164PhoneNumber, false);

  if (user) {
    UserHelper.checkIfIsRecentlyDeletedUser(user);
  }

  if (user && !email) {
    UserHelper.checkIfIsUnsubscribedUser(user);
  }

  if (user && email && user.email !== email) {
    dogstatsd.increment('send_verification.mismatched_emails');
    const traceId = uuid.v4();
    const errorPayload = {
      traceId,
      email,
      id: user.id,
      phone: user.phoneNumber,
      userEmail: user.email,
    };
    logger.error('send_verification.mismatched_emails', errorPayload);
    throw new UnauthenticatedError('Email is not verified for this user.', {
      data: { email, traceId },
    });
  }

  if (config.get('phoneNumbers.shouldSendVerificationCode')) {
    await UserHelper.sendVerificationCode({
      phoneNumber: e164PhoneNumber,
      email: email && user?.email,
    });
  }
}

export async function verifyNumberOrSendVerification({
  phoneNumber,
  verificationCodeOnly,
  isSignUp,
}: VerifyNumberOrSendVerificationPayload): Promise<VerificationInfoResponse | void> {
  const user = await User.findOneByPhoneNumber(toE164(phoneNumber), false);

  if (user) {
    UserHelper.checkIfIsUnsubscribedUser(user);
    UserHelper.checkIfIsRecentlyDeletedUser(user);
  }

  // If user is found during sign up, we don't send anything because mobile app takes care of next steps
  const requiresUserVerificationInfo = user?.isActive() && !verificationCodeOnly;
  if (requiresUserVerificationInfo) {
    const verificationInfo = await UserHelper.getVerificationInfo(user, isSignUp, null);
    return verificationInfo;
  }

  const shouldSendVerificationCode =
    config.get('phoneNumbers.shouldSendVerificationCode') && (verificationCodeOnly || isSignUp);

  if (shouldSendVerificationCode) {
    await UserHelper.sendVerificationCode({ phoneNumber: toE164(phoneNumber) });
  }

  return;
}

export async function oldSendVerification(phoneNumber: string): Promise<void> {
  const user = await User.findOneByPhoneNumber(toE164(phoneNumber), false);

  if (user) {
    const daysDeleted = user.isSoftDeleted() ? moment().diff(moment(user.deleted), 'days') : null;

    if (user.unsubscribed) {
      throw new ForbiddenError(InvalidParametersMessageKey.TextResubscribe, {
        customCode: CUSTOM_ERROR_CODES.USER_VERIFICATION_MESSAGES_UNSUBSCRIBED,
      });
    } else if (daysDeleted !== null && daysDeleted < 60 && !user.overrideSixtyDayDelete) {
      dogstatsd.increment('user.attempted_to_create_account_before_timeout');
      throw new ForbiddenError(InvalidParametersMessageKey.TooSoonToCreateNewAccount, {
        customCode: CUSTOM_ERROR_CODES.USER_DELETED_ACCOUNT_TOO_SOON,
        data: { daysRemaining: 60 - daysDeleted },
        interpolations: {
          remainingDays: 60 - daysDeleted,
        },
      });
    }
  }
  if (config.get('phoneNumbers.shouldSendVerificationCode')) {
    const isAllowedVoip = !!user;
    await UserHelper.sendVerificationCode({
      phoneNumber: toE164(phoneNumber),
      isAllowedVoip,
    });
  }
}

// for new users only
export async function updateEmailPassword({
  deviceId,
  email,
  password,
  user,
}: ValidUpdateEmailPasswordPayload): Promise<void> {
  if (email) {
    await EmailVerificationHelper.attemptCreateAndSendEmailVerification({
      id: user.id,
      newEmail: email,
      oldEmail: user.email,
    });
  }
  await user.setPassword(password);
  await user.save();

  email
    ? dogstatsd.increment(`user.attempted_password_success`)
    : dogstatsd.increment(`user.attempted_email_and_password_success`);

  await AuditLog.create({
    userId: user.id,
    type: email ? 'SET_EMAIL_PASSWORD' : 'SET_PASSWORD',
    message: 'Successfully set email and/or password.',
    successful: true,
    extra: { deviceId },
  });
}
