import ErrorHelper from '@dave-inc/error-helper';
import loomisClient, { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus, VerificationInfoResponse } from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import * as Bluebird from 'bluebird';
import * as config from 'config';
import { cloneDeep, compact, get, isEmpty, isNil, toLower, toString, omit } from 'lodash';
import { Moment } from 'moment';
import { Response } from 'request';
import { Op, WhereOptions } from 'sequelize';
import { getVerificationStatus } from '../domain/identity-verification-engine';
import phoneNumberVerification from '../domain/phone-number-verification';
import * as identityApi from '../domain/identity-api';
import * as AddressVerification from '../lib/address-verification';
import { validateAddressForBankingUser } from '../lib/address-verification';

import { dogstatsd } from '../lib/datadog-statsd';
import { decode, encode } from '../lib/jwt';
import {
  AlreadyExistsError,
  BaseApiError,
  ConflictError,
  CUSTOM_ERROR_CODES,
  ForbiddenError,
  GenericUpstreamError,
  InvalidCredentialsError,
  InvalidParametersError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/error';
import logger from '../lib/logger';
import mxClient from '../lib/mx';
import redisClient from '../lib/redis';
import sendgrid from '../lib/sendgrid';
import {
  Advance,
  AuditLog,
  BankAccount,
  BankConnection,
  SubscriptionBilling,
  SynapsepayDocument,
  ThirdPartyName,
  User,
  UserSession,
  UserSetting,
} from '../models';
import twilio from '../lib/twilio';
import {
  generateRandomNumber,
  MFA_LENGTH,
  MFACodeValidation,
  Modifications,
  obfuscateEmail,
  toE164,
  toNonE164Format,
  validateE164,
  validateEmail,
  validateMFACode,
} from '../lib/utils';
import { ZENDESK_CUSTOM_FIELD_ID } from '../lib/zendesk/constants';
import { parseLoomisGetPaymentMethod } from '../services/loomis-api/helper';
import {
  ConstraintMessageKey,
  FailureMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
} from '../translations';
import {
  CooloffStatus,
  PaymentSource,
  SettingId,
  UserIdentityVerificationFields,
  UserUpdateFields,
  ZendeskTicket,
  ZendeskTicketCustomField,
  ZendeskUser,
  AddressUpdateEligibility,
  AddressUpdateRejectReason,
} from '../typings';

export default {
  attemptToSetAdminLoginOverrideSession,
  checkIfEmailIsDuplicate,
  checkIfIsUnsubscribedUser,
  checkIfIsRecentlyDeletedUser,
  fetchName,
  findByZendeskInfo,
  getAllPrimaryBankAccounts,
  getAllPrimaryPaymentSources,
  getCoolOffStatus,
  getNextSubscriptionPaymentDate,
  getUserByToken,
  getVerificationInfo,
  logModifications,
  sendCreatePasswordEmail,
  sendResetPasswordEmail,
  sendVerificationCode,
  setAdminLoginOverride,
  hasBirthdateChanged,
  validateDefaultBankAccountUpdate,
  validateParams,
  validateVerificationCode,
  verifyUserIdentity,
  verifyUserPassword,
  sendNewDeviceMFACode,
  getAdminLoginOverride,
  deleteAdminLoginOverride,
  getShowBanner,
};

const {
  numberOfAddressUpdatesAllowed,
  addressControlEnabled,
  passedKycLockDays,
  addressUpdatesLookbackDays,
} = config.get<{
  numberOfAddressUpdatesAllowed: number;
  addressControlEnabled: boolean;
  passedKycLockDays: number;
  addressUpdatesLookbackDays: number;
}>('risk.addressControl');

type AdminLoginOverrideInfo = {
  pin: number;
  password: string;
};

const RESET_PASSWORD_EMAIL_ID = 'fdca67ea-7647-4422-9866-2a76d9f1d17e';
const CREATE_PASSWORD_EMAIL_ID = '945c649f-3432-4064-8fab-c504e0437ff0';
const DAVE_WEB_URL = config.get('dave.website.url');
const ADMIN_OVERRIDE_PASSWORD_BASE = 'DaveSaves';

async function getVerificationInfo(
  user: User,
  isSignUp: boolean = false,
  forgotPassword: boolean = false,
): Promise<VerificationInfoResponse> {
  const adminLoginOverrideInfo = await getAdminLoginOverride(user.phoneNumber);
  if ((!forgotPassword && user.password) || adminLoginOverrideInfo) {
    return { hasProvidedEmailAddress: Boolean(user.email), hasCreatedPassword: true };
  } else if (user.email) {
    // We don't want to send an email when this is called during sign up
    if (!isSignUp) {
      await sendCreatePasswordEmail(user.email, user.phoneNumber, user.firstName);
    }
    // We obfuscate the email in the return payload because in this scenario, we want
    // to prevent an attacker from finding out someone else's email this way
    return {
      hasProvidedEmailAddress: true,
      hasCreatedPassword: false,
      email: obfuscateEmail(user.email),
    };
  } else {
    const verificationInfo = await phoneNumberVerification.checkForContractChange(
      user,
      isSignUp,
      forgotPassword,
    );
    return verificationInfo;
  }
}

function checkIfIsUnsubscribedUser(user: User): void {
  if (user.unsubscribed) {
    dogstatsd.increment('user.send_verification.unsubscribed_user');
    throw new ForbiddenError(InvalidParametersMessageKey.TextResubscribe, {
      customCode: CUSTOM_ERROR_CODES.USER_VERIFICATION_MESSAGES_UNSUBSCRIBED,
    });
  }
}

function checkIfIsRecentlyDeletedUser(user: User): void {
  const daysDeleted = user.isSoftDeleted() ? moment().diff(moment(user.deleted), 'days') : null;

  if (daysDeleted !== null && daysDeleted < 60 && !user.overrideSixtyDayDelete) {
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

async function _validatePassword(
  user: User,
  password: string,
  adminLoginOverrideInfo: AdminLoginOverrideInfo,
) {
  let isValidated;
  if (adminLoginOverrideInfo) {
    await AuditLog.create({
      userId: user.id,
      type: 'SUPPORT_OVERRIDE_LOGIN_ATTEMPT',
      extra: {
        phoneNumber: user.phoneNumber,
      },
    });
    isValidated = password === adminLoginOverrideInfo.password;
  }

  if (!isValidated) {
    try {
      isValidated = await bcrypt.compare(password, user.password);
    } catch (error) {
      //
      logger.error('Error validating password', { error });
      // Whether it errored out because password was null or or any other reason, we keep isValidated falsey
      dogstatsd.increment('user.login_with_password.decryption_error');
    }
  }
  return isValidated;
}

async function verifyUserPassword(
  user: User,
  password: string,
  attemptsRemaining: number,
): Promise<void> {
  const adminLoginOverrideInfo = await getAdminLoginOverride(user.phoneNumber);
  const isValidated = await _validatePassword(user, password, adminLoginOverrideInfo);
  if (!isValidated) {
    dogstatsd.increment('user.login_with_password.incorrect_password');
    throw new InvalidCredentialsError('Credentials provided are invalid.', {
      name: 'invalid_credentials',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
      data: { attemptsRemaining },
    });
  }
}

async function sendResetPasswordEmail(email: string, name: string): Promise<[Response, any]> {
  const token = encode({ email });

  logger.info(`Password reset form sent`, { email });

  /**
   * Fire and forget this promise since it's
   * just for logging purposes. Using the
   * AuditLog table for now because this
   * is a low-traffic endpoint and we
   * don't want to send emails to
   * stackdriver logs
   */
  //TO-DO: remove in RAM-377
  AuditLog.create({
    userId: -1, // userId is required in this table but is never available on this endpoint
    type: 'PASSWORD_RESET_FORM_SENT',
    message: `password reset form sent to email '${email}'`,
    extra: { email },
  });

  return sendgrid.send(
    undefined,
    RESET_PASSWORD_EMAIL_ID,
    {
      ACTION_URL: `${DAVE_WEB_URL}/set-password?token=${token}&email=${email}&isResetPassword=true`,
      NAME: name || '',
    },
    email,
  );
}

async function sendCreatePasswordEmail(
  email: string,
  phoneNumber: string,
  name: string,
): Promise<[Response, any]> {
  const nonE164PhoneNumber = toNonE164Format(phoneNumber);
  const token = encode({ phoneNumber: nonE164PhoneNumber });

  return sendgrid.send(
    undefined,
    CREATE_PASSWORD_EMAIL_ID,
    {
      NAME: name,
      ACTION_URL: `${DAVE_WEB_URL}/set-password?token=${token}&email=${email}`,
    },
    email,
  );
}

// Finds a user by a their phoneNumber or a verified email
async function getUserByToken(token: string): Promise<User> {
  const { phoneNumber, email } = decode(token);
  return User.findOneByPhoneNumberOrEmail({ phoneNumber, email });
}

/**
 * Text or email a random code to user & save phone_number:code in Redis
 * @param {String} e164PhoneNumber - a 10-digit phone number (US-only)
 * @param {String} [email] - Email to send to (if applicable)
 */
async function sendVerificationCode({
  phoneNumber,
  email,
  isAllowedVoip,
}: {
  phoneNumber: string;
  email?: string;
  isAllowedVoip?: boolean;
}): Promise<void> {
  const e164PhoneNumber = validateE164(phoneNumber) ? phoneNumber : toE164(phoneNumber);
  let carrierName: string;
  let carrierCode: string;
  if (!email) {
    const twilioData = await twilio.getMobileInfo(e164PhoneNumber);
    if (!isAllowedVoip && !twilioData.isMobile) {
      throw new InvalidParametersError(`You gotta use your real number. No VoIP or burners.`);
    }
    carrierName = twilioData.carrierName;
    carrierCode = twilioData.carrierCode;
  }

  await phoneNumberVerification.send({
    e164PhoneNumber,
    carrierName,
    carrierCode,
    email,
  });
  dogstatsd.increment('user.verification_code_sent');
}

/**
 * Fetches a key:value pair from Redis
 * @param {Number} phoneNumber - a 10-digit phone number (US-only)
 * @param {Number} code - a verification code
 * @returns {String||null}
 */

async function getOverrideCode(phoneNumber: string) {
  const adminOverride = await getAdminLoginOverride(phoneNumber);
  if (adminOverride && adminOverride.pin) {
    return adminOverride.pin.toString();
  } else if (config.get<boolean>('phoneNumbers.easyVerification')) {
    return '1'.repeat(MFA_LENGTH);
  }
}

async function validateVerificationCode(phoneNumber: string, code: any) {
  const strCode = toString(code);
  const codeValidation = validateMFACode(strCode);
  if (codeValidation === MFACodeValidation.ValidMFA) {
    const overrideCode = await getOverrideCode(phoneNumber);
    return phoneNumberVerification.verify(phoneNumber, strCode, overrideCode);
  } else if (codeValidation === MFACodeValidation.InvalidLegacyMFA) {
    dogstatsd.increment('user.legacy_mfa_code_sent');
    throw new InvalidParametersError(InvalidParametersMessageKey.LegacyVerificationCode);
  } else {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidVerificationCode);
  }
}

// Validates the params passed in and in certain cases updates the payload with those params if validated successfully
async function validateParams(
  user: User,
  params: any,
  updatePayload: UserIdentityVerificationFields | UserUpdateFields,
  skipAddressVerification: boolean,
): Promise<UserIdentityVerificationFields | UserUpdateFields> {
  const payload = cloneDeep(updatePayload);
  const {
    addressLine1,
    addressLine2,
    city,
    defaultBankAccountId,
    state,
    zipCode,
    firstName,
    lastName,
    isDaveBankingSignUp,
    phoneNumber,
    birthdate,
    email,
  } = params;

  if (firstName || lastName) {
    const definedFirstName: string = firstName || user.firstName;
    const definedLastName: string = lastName || user.lastName;
    const isNameValid = await validateNameUpdate(definedFirstName, definedLastName, user);
    if (isNameValid) {
      payload.firstName = definedFirstName;
      payload.lastName = definedLastName;
    }
  }

  if (email && !validateEmail(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  if (addressLine1 || city || state || zipCode) {
    if (!AddressVerification.isAddressComplete({ addressLine1, city, state, zipCode })) {
      throw new InvalidParametersError('Incomplete address', {
        customCode: CUSTOM_ERROR_CODES.USER_INCOMPLETE_ADDRESS,
      });
    }

    payload.city = city;
    payload.state = state;
    payload.zipCode = zipCode;
    payload.addressLine1 = addressLine1;
    if (addressLine2 || user.addressLine2) {
      payload.addressLine2 = addressLine2 || null;
    }

    if (!skipAddressVerification) {
      const addressVerification = await AddressVerification.verifyAddress({
        addressLine1,
        addressLine2,
        city,
        state,
        zipCode,
      });
      if (addressVerification.errorMsg) {
        dogstatsd.increment('address_verification.error');
        throw new InvalidParametersError(addressVerification.errorMsg, {
          customCode: CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS,
          data: { originalAddress: addressVerification.originalAddress },
        });
      }

      payload.city = addressVerification.normalizedAddress.city;
      payload.state = addressVerification.normalizedAddress.state;
      payload.zipCode = addressVerification.normalizedAddress.zipCode;
      payload.countryCode = addressVerification.normalizedAddress.countryCode;
      payload.addressLine1 = addressLine2
        ? addressLine1
        : addressVerification.normalizedAddress.street;
      if (addressLine2 || user.addressLine2) {
        payload.addressLine2 = addressLine2 || null;
      }
    }

    // use the normalized address values when checking for bank validity
    // so we don't run into length issues
    if (isDaveBankingSignUp || (await user.hasDaveBanking())) {
      const { errorMessage } = validateAddressForBankingUser({
        addressLine1: payload.addressLine1,
        addressLine2: payload.addressLine2,
        city: payload.city,
      });

      if (errorMessage) {
        dogstatsd.increment('address_verification.invalid_address_for_banking');
        throw new InvalidParametersError(errorMessage, {
          customCode: CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS,
          data: {
            originalAddress: {
              addressLine1,
              addressLine2,
              city,
              state,
              zipCode,
            },
          },
        });
      }
    }

    const allowAddressUpdate = await isAddressUpdateAllowed(user);

    if (!allowAddressUpdate.allowAddressUpdate) {
      dogstatsd.increment('address_verification.cant_update_address');
      throw new UnauthorizedError(ConstraintMessageKey.DenyUpdateAddress, {
        customCode: CUSTOM_ERROR_CODES.USER_DENY_UPDATE_ADDRESS,
      });
    }

    // all validations passed
    dogstatsd.increment('address_verification.success');
  }

  if (birthdate) {
    const birthdateMoment = moment(birthdate);
    if (hasBirthdateChanged(birthdateMoment, user)) {
      payload.birthdate = birthdateMoment;
    }
    if (birthdateMoment.isAfter(moment().subtract(18, 'years'))) {
      throw new InvalidParametersError('Sorry! You have to be at least 18 years old', {
        customCode: CUSTOM_ERROR_CODES.USER_LESS_THAN_18,
      });
    }
  }

  if (phoneNumber) {
    const userForNewNumber = await User.findOneByPhoneNumber(phoneNumber);
    if (userForNewNumber) {
      throw new AlreadyExistsError(InvalidParametersMessageKey.NewPhoneNumberAlreadyUsed);
    }
  }

  if (defaultBankAccountId) {
    await validateDefaultBankAccountUpdate(defaultBankAccountId, user);
  }

  return payload;
}

export async function isAddressUpdateAllowed(user: User): Promise<AddressUpdateEligibility> {
  const eligibility: AddressUpdateEligibility = { allowAddressUpdate: true };
  if (!addressControlEnabled) {
    return eligibility;
  }

  const addressUpdatesLookbackCutoff = moment().subtract(addressUpdatesLookbackDays || 30, 'days');
  const passedKycLockDateCutOff = moment().subtract(passedKycLockDays || 90, 'days');
  let kycCheckedAt;

  try {
    kycCheckedAt = await identityApi.kycPassedCheckedAt(user.id);
  } catch (error) {
    logger.error('Error when calling identity api to get kyc passed checked at', { error });
    throw new UnauthorizedError(ConstraintMessageKey.DenyUpdateAddress, {
      customCode: CUSTOM_ERROR_CODES.USER_DENY_UPDATE_ADDRESS,
    });
  }

  // kyc happened within 90 days
  if (kycCheckedAt && kycCheckedAt.isAfter(passedKycLockDateCutOff)) {
    eligibility.allowAddressUpdate = false;
    eligibility.addressUpdateRejectReason = AddressUpdateRejectReason.KycLockPeriod;
    return eligibility;
  }

  const userAddresses = user.userAddresses || (await user.getUserAddresses());
  const updates = userAddresses.filter(address =>
    moment(address.created).isAfter(addressUpdatesLookbackCutoff),
  );

  if (updates && updates.length >= numberOfAddressUpdatesAllowed) {
    eligibility.allowAddressUpdate = false;
    eligibility.addressUpdateRejectReason = AddressUpdateRejectReason.TooManyRecentUpdates;
  }

  return eligibility;
}

async function validateDefaultBankAccountUpdate(defaultBankAccountId: number, user: User) {
  const bankAccount = await BankAccount.findByPk(defaultBankAccountId);

  if (!bankAccount || `${bankAccount.userId}` !== `${user.id}`) {
    throw new NotFoundError(NotFoundMessageKey.BankAccountNotFoundById, {
      interpolations: {
        bankAccountId: defaultBankAccountId,
      },
    });
  }
}

/**
 * Prevents user update endpoints from updating validated users' names.
 */
export async function validateNameUpdate(
  firstName: string,
  lastName: string,
  user: User,
): Promise<boolean> {
  if (
    toLower(firstName) === toLower(user.firstName) &&
    toLower(lastName) === toLower(user.lastName)
  ) {
    return false;
  }

  const idResult = await verifyUserIdentity(user, {
    auditLog: false,
    isAdmin: false,
  });

  let allowUpdate = !idResult.success;

  if (allowUpdate) {
    try {
      // allowUpdate when synpase is not successful or not run and has never run socure KYC
      allowUpdate = await identityApi.hasNeverRunSocureKyc(user.id);
    } catch (error) {
      logger.error('Error when calling identity api to get socure KYC status', { error });
      throw new GenericUpstreamError(error);
    }
  }

  if (!allowUpdate) {
    throw new InvalidParametersError(
      `Your name has already been verified as ${user.firstName} ${user.lastName} and cannot be changed.`,
    );
  }

  return true;
}

/**
 * Prevents user update endpoints from updating validated users' birthdates.
 */
function hasBirthdateChanged(birthdate: Moment, user: User): boolean {
  return !user.birthdate || !birthdate.isSame(user.birthdate, 'day');
}

function adminOverrideKey(e164PhoneNumber: string): string {
  return `adminLogin:${e164PhoneNumber}`;
}

// Allow anybody to log in as a specific user for the next 60 seconds
async function setAdminLoginOverride(
  e164PhoneNumber: string,
  { ttl, pin, password }: { ttl?: number; pin?: number; password?: string } = { ttl: 60 },
): Promise<AdminLoginOverrideInfo> {
  pin = pin ?? generateRandomNumber(MFA_LENGTH);
  const adminLoginOverrideInfo = {
    pin,
    password: password ?? `${ADMIN_OVERRIDE_PASSWORD_BASE}${pin}`,
  };
  const ttlParams = isNil(ttl) ? [] : ['EX', `${ttl}`];
  await redisClient.setAsync([
    adminOverrideKey(e164PhoneNumber),
    JSON.stringify(adminLoginOverrideInfo),
    ...ttlParams,
  ]);
  return adminLoginOverrideInfo;
}

async function getAdminLoginOverride(e164PhoneNumber: string): Promise<AdminLoginOverrideInfo> {
  const adminLoginOverrideInfo = await redisClient.getAsync(adminOverrideKey(e164PhoneNumber));
  if (adminLoginOverrideInfo) {
    return JSON.parse(adminLoginOverrideInfo);
  } else {
    return;
  }
}

async function deleteAdminLoginOverride(e164PhoneNumber: string): Promise<void> {
  await redisClient.delAsync(adminOverrideKey(e164PhoneNumber));
}

// We only set admin login override if user actually logged in using admin override password
async function attemptToSetAdminLoginOverrideSession(
  userSession: UserSession,
  e164PhoneNumber: string,
  password: string,
): Promise<void> {
  const adminLoginOverrideInfo = await getAdminLoginOverride(e164PhoneNumber);
  const usedAdminLoginOverride = get(adminLoginOverrideInfo, 'password') === password;

  if (usedAdminLoginOverride) {
    userSession.adminLoginOverride = true;
    await userSession.save();
  }
}

const DEBIT_PAYMENT_DAYS_THRESHOLD = 1;
const ACH_PAYMENT_DAYS_THRESHOLD = 3;

async function getCoolOffStatus(userId: number): Promise<CooloffStatus> {
  const notCoolingOff: CooloffStatus = {
    coolOffDate: null,
    isCoolingOff: false,
  };
  const latestPaymentResponse = await loomisClient.getLatestTransactionDetails(
    PaymentProviderTransactionType.AdvancePayment,
    userId,
  );
  if ('error' in latestPaymentResponse) {
    throw latestPaymentResponse.error;
  }

  const latestPayment = latestPaymentResponse.data;
  if (!latestPayment) {
    return notCoolingOff;
  }
  const now = moment();

  if (latestPayment.isACH) {
    const achCoolOffDate = moment(latestPayment.created).add(ACH_PAYMENT_DAYS_THRESHOLD, 'days');
    if (achCoolOffDate.isAfter(now)) {
      return {
        coolOffDate: achCoolOffDate,
        isCoolingOff: true,
      };
    }
    return notCoolingOff;
  }

  const latestAdvance = await Advance.findOne({
    order: [['created', 'DESC']],
    where: { userId, disbursementStatus: { [Op.ne]: ExternalTransactionStatus.Canceled } },
  });

  let coolOffDate: Moment;
  if (latestAdvance && latestAdvance.isMicroAdvance()) {
    coolOffDate = latestAdvance.created.clone().add(DEBIT_PAYMENT_DAYS_THRESHOLD, 'days');
  } else {
    coolOffDate = moment(latestPayment.created).add(DEBIT_PAYMENT_DAYS_THRESHOLD, 'days');
  }
  if (coolOffDate.isAfter(now)) {
    return {
      coolOffDate,
      isCoolingOff: true,
    };
  }
  return notCoolingOff;
}

export async function getNextSubscriptionPaymentDate(user: User, date?: string | Moment) {
  const time = moment(date);

  if (user.isSoftDeleted() && user.deleted.isSameOrBefore(time)) {
    return null;
  }

  const billing = await SubscriptionBilling.findOne({
    where: {
      billingCycle: time.format('YYYY-MM'),
      userId: user.id,
    },
  });

  if (!billing || !billing.dueDate) {
    return null;
  }

  const isPaid = await billing.isPaid();
  if (isPaid) {
    return time
      .clone()
      .add(1, 'month')
      .startOf('month')
      .format('YYYY-MM-DD');
  }

  return billing.dueDate.format('YYYY-MM-DD');
}

export async function fetchName(user: User): Promise<{ firstName: string; lastName: string }> {
  if (user.hasName) {
    return {
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  const thirdPartyName = await ThirdPartyName.findOne({ where: { userId: user.id } });
  if (thirdPartyName) {
    return {
      firstName: thirdPartyName.firstName,
      lastName: thirdPartyName.lastName,
    };
  }

  const twilioName = await twilio.getName(user.phoneNumber);

  if (twilioName) {
    await ThirdPartyName.create({
      userId: user.id,
      ...twilioName,
    });

    return twilioName;
  } else {
    await ThirdPartyName.create({
      userId: user.id,
    });

    return {
      firstName: null,
      lastName: null,
    };
  }
}

export async function findByZendeskInfo(
  zendeskUser: ZendeskUser,
  ticket: ZendeskTicket,
): Promise<User> {
  const { external_id: id, email } = zendeskUser;
  const { custom_fields: customFields } = ticket;

  if (id) {
    return User.findOne({ where: { id }, paranoid: false });
  }

  const users = await Promise.all([
    matchUserByEmail(email),
    matchUserByPhoneNumber(customFields),
  ]).then(compact);

  const matchingUser = users.reduce((prev, current, i, all) => {
    if (prev.id !== current.id) {
      throw new ConflictError('User for phone number and email do not match', {
        data: {
          users: all,
        },
      });
    }

    return current;
  }, users[0]);

  return matchingUser;
}

async function matchUserByEmail(email: string) {
  if (email) {
    const users = await User.findAll({
      where: {
        email,
      },
      paranoid: false,
    });

    const matchingUser = selectMatchingUser(users, 'Found more than one matching user for email');

    return matchingUser;
  }
}

async function matchUserByPhoneNumber(customFields: ZendeskTicketCustomField[]) {
  const phoneNumberFieldId = ZENDESK_CUSTOM_FIELD_ID.PHONE_NUMBER;
  const phoneField = customFields.find(field => field.id === phoneNumberFieldId);

  if (phoneField && phoneField.value) {
    const phoneNumber = toE164(`${phoneField.value}`);
    const users = await User.findAll({
      where: {
        phoneNumber: { [Op.like]: `${phoneNumber}%` },
      },
      paranoid: false,
    });

    const matchingUser = selectMatchingUser(
      users,
      'Found more than one matching user for phone number',
    );

    return matchingUser;
  }
}

function selectMatchingUser(
  users: User[],
  errorMessage: string = 'Found more than one matching user',
) {
  if (users.length === 1) {
    return users[0];
  }

  const activeUsers = users.filter(user => user.isActive());

  if (activeUsers.length === 1) {
    return activeUsers[0];
  }

  if (users.length > 1) {
    throw new ConflictError(errorMessage, {
      data: {
        users,
      },
    });
  }
}

type DuplicateEmailQuery = {
  where: WhereOptions;
};

// An email is considered duplicate if it already exists on another user
export async function checkIfEmailIsDuplicate(email: string, userId?: number): Promise<void> {
  const query: DuplicateEmailQuery = { where: { email } };
  if (userId) {
    query.where = {
      ...query.where,
      id: { [Op.ne]: userId },
    };
  }
  const userWithExistingEmail = await User.findOne(query);
  if (userWithExistingEmail) {
    throw new AlreadyExistsError(ConstraintMessageKey.UserWithExistingEmail);
  }
}

export async function verifyUserIdentity(
  user: User,
  { isAdmin = false, auditLog = false }: { isAdmin?: boolean; auditLog?: boolean } = {},
) {
  const document = await SynapsepayDocument.findOne({ where: { userId: user.id } });
  const verificationResult = getVerificationStatus(document);

  if (auditLog) {
    await AuditLog.create({
      userId: user.id,
      type: AuditLog.TYPES.IDENTITY_VERIFICATION,
      message: verificationResult.error,
      successful: verificationResult.success,
      extra: { admin: isAdmin },
    });
  }

  return verificationResult;
}

/**
 * Fetches all bank accounts that are flagged as primary based on the provided user's bank connections
 *
 * @param {number} userId
 * @param {boolean} paranoid
 * @param {boolean} onlySupported
 * @returns {Promise<BankAccount[]>}
 */
async function getAllPrimaryBankAccounts(
  userId: number,
  { paranoid = true, onlySupported = true }: { paranoid?: boolean; onlySupported?: boolean } = {},
): Promise<BankAccount[]> {
  const BankAccountModel = onlySupported ? BankAccount.scope('supported') : BankAccount;

  return BankAccountModel.findAll({
    where: { userId },
    include: [
      {
        model: BankConnection,
        where: {
          primaryBankAccountId: { [Op.col]: 'BankAccount.id' },
          userId,
        },
        required: true,
      },
    ],
    paranoid,
  });
}

/**
 * Fetches all supported primary payment sources associated with the provided user,
 * which includes bank accounts that are flagged as primary in the bank connection table,
 * and their corresponding payment method
 *
 * @param {number} userId
 * @param {boolean} paranoid
 * @returns {Promise<PaymentSource[]>}
 */
async function getAllPrimaryPaymentSources(
  userId: number,
  { paranoid = true }: { paranoid?: boolean } = {},
): Promise<PaymentSource[]> {
  const primaryBankAccounts = await BankAccount.scope('supported').findAll({
    where: { userId },
    include: [
      {
        model: BankConnection,
        where: {
          primaryBankAccountId: { [Op.col]: 'BankAccount.id' },
          userId,
        },
        required: true,
      },
    ],
    paranoid,
  });

  return Bluebird.map(primaryBankAccounts, async bankAccount => ({
    bankAccount,
    debitCard: parseLoomisGetPaymentMethod(
      await loomisClient.getPaymentMethod({ id: bankAccount.defaultPaymentMethodId }),
      __filename,
    ),
  }));
}

/**
 * Handles deleting the user's associated MX user object
 *
 * @param {User} user
 * @returns {Promise<void>}
 */
export async function deleteMxUser(user: User): Promise<void> {
  try {
    await mxClient.users.deleteUser(user.mxUserId);
  } catch (err) {
    // Mx user does not exist
    if (get(err, 'response.statusCode') === 404) {
      await user.update({ mxUserId: null });
      return;
    }

    dogstatsd.increment('user.delete_user.mx_error');
    logger.error(`Unable to delete mx user while deleting user`, {
      error: err,
    });

    // Bubble up any unexpected errors
    throw new BaseApiError(ConstraintMessageKey.DeleteAssocMxUser, {
      data: { userId: user.id, mxUserId: user.mxUserId, err },
    });
  }

  await user.update({ mxUserId: null });
}

async function logModifications({
  modifications,
  userId,
  type,
  requestPayload = {},
  extras = {},
}: {
  modifications: Modifications;
  userId: number;
  type: string;
  requestPayload?: any;
  extras?: any;
}): Promise<void> {
  if (!isEmpty(modifications)) {
    const extra = {
      requestPayload: omit(requestPayload, ['account', 'routing']),
      modifications,
      ...extras,
    };
    try {
      await AuditLog.create({
        userId,
        type,
        successful: true,
        extra,
      });
    } catch (error) {
      logger.error('Error creating audit log in user helper', { error });
    }
  }
}

export async function sendNewDeviceMFACode(user: User, sms: boolean = true): Promise<void> {
  checkIfIsUnsubscribedUser(user);
  checkIfIsRecentlyDeletedUser(user);

  if (config.get<boolean>('phoneNumbers.shouldSendVerificationCode')) {
    const e164PhoneNumber = toE164(user.phoneNumber);
    try {
      if (sms) {
        await sendVerificationCode({
          phoneNumber: e164PhoneNumber,
          isAllowedVoip: true, // some legacy users have VoIP numbers
        });
      } else {
        await sendVerificationCode({
          phoneNumber: e164PhoneNumber,
          email: user.email,
        });
      }
    } catch (err) {
      logger.error('Error sending mfa code', { error: ErrorHelper.logFormat(err) });
      throw new BaseApiError(FailureMessageKey.SendMfaCodeFailure, {});
    }
  }
}

async function getShowBanner(userId: number): Promise<boolean> {
  const showBanner = await UserSetting.findOne({
    where: { userId, userSettingNameId: SettingId.showbanner, value: 'true' },
  });
  if (showBanner) {
    return true;
  }
  return false;
}
