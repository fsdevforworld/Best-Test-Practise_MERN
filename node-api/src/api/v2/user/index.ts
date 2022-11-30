import {
  ResetPasswordEmailResponse,
  StandardResponse,
  UserResponse,
  UserUpdateNameResponse,
  VerificationInfoResponse,
  VerifyAddressResponse,
  VerifyDaveBankingSSNResponse,
  UserAccountChecks,
  UserExternalIdResponse,
} from '@dave-inc/wire-typings';
import * as config from 'config';
import { Request, Response } from 'express';
import AccountManagement from '../../../domain/account-management';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { InvalidParametersError } from '../../../lib/error';
import Firebase from '../../../lib/firebase';
import { encode, getExpiration } from '../../../lib/jwt';
import { verifyAddress } from '../../../lib/usps';
import { deepTrim, getParams, toE164 } from '../../../lib/utils';
import { AuditLog, User } from '../../../models';
import { serializeDate } from '../../../serialization';
import { IDaveRequest, IDaveResponse } from '../../../typings';

import * as UserController from './controller';
import * as RequestResponseHelpers from './helpers';
import * as UserValidator from './validator';
import * as SendVerificationValidator from './send-verification/validator';
import { validateDeleteUserRequest } from './delete/validator';
import * as UserSerializer from './serializer';
import { performUserAccountChecks } from './account-checks';

const JWT_BANKING_VERIFIED_SSN_EXPIRATION: number = config.get(
  'resetPassword.daveBanking.userHasVerfiedSSN.jwt.expiration',
);

export const MIN_VERSION_SEND_VERIFICATION = config.get<string>('minAppVersion.sendVerification');
export const MIN_VERSION_LOGIN = config.get<string>('minAppVersion.login');
export const MIN_VERSION_RESET_PASSWORD = config.get<string>('minAppVersion.resetPassword');
export const MIN_VERSION_IDENTITY_VERIFICATION = config.get<string>(
  'minAppVersion.identityVerification',
);

// Get the logged in user
export async function get(req: IDaveRequest, res: IDaveResponse<UserResponse>): Promise<Response> {
  const parsedUserData = await UserValidator.validateAndParseGetUserRequest(req);

  const userResponse = UserSerializer.serializeUserResponse(parsedUserData);

  return res.send(userResponse);
}

export async function getExternalId(
  req: IDaveRequest,
  res: IDaveResponse<UserExternalIdResponse>,
): Promise<Response> {
  const externalId = await req.user.getOrCreateExternalId();
  return res.send({ externalId });
}

export async function verifyNumber(
  req: Request,
  res: IDaveResponse<VerificationInfoResponse>,
): Promise<Response> {
  const { phoneNumber, isSignUp, forgotPassword } = await UserValidator.validateVerifyNumberRequest(
    req,
  );

  const user = await User.findOneByPhoneNumber(toE164(phoneNumber), false);

  const response = await UserSerializer.serializeVerificationInfoResponse(user, {
    isSignUp,
    forgotPassword,
  });

  return res.send(response);
}

export async function sendVerification(
  req: Request,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const { phoneNumber, email } = await SendVerificationValidator.validateSendMfaCodeRequest(req);

  await UserController.sendVerification(phoneNumber, email);

  return res.send();
}

// Deprecated, use verifyNumber or sendVerification
export async function verifyNumberOrSendVerification(
  req: Request,
  res: IDaveResponse<VerificationInfoResponse>,
): Promise<Response> {
  const { phoneNumber, verificationCodeOnly, isSignUp } = getParams(
    req.body,
    ['phoneNumber'],
    ['verificationCodeOnly', 'isSignUp'],
  );

  const response = await UserController.verifyNumberOrSendVerification({
    phoneNumber,
    verificationCodeOnly,
    isSignUp,
  });

  if (response) {
    return res.send(response);
  }

  // If no user is found or user passes validation checks, we send back a flag telling app to create new user
  return verificationCodeOnly ? res.send() : res.send({ isNewUser: true });
}

/*
 * Old code to send a verification to the user
 */
export async function oldSendVerification(
  req: Request,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const phoneNumber = req.body.phoneNumber;

  if (!phoneNumber) {
    throw new InvalidParametersError(null, {
      required: ['phoneNumber'],
      provided: [],
    });
  }

  await UserController.oldSendVerification(phoneNumber);
  return res.send({ ok: true });
}

export async function setEmailPassword(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const emailPasswordPayload = await UserValidator.validateSetEmailPasswordRequest(req);

  await UserController.updateEmailPassword(emailPasswordPayload);
  return res.send({ ok: true });
}

export async function updateName(
  req: IDaveRequest,
  res: IDaveResponse<UserUpdateNameResponse>,
): Promise<Response> {
  const updateNamePayload = await UserValidator.validateUpdateNameRequest(req);

  await UserController.updateNameAndLicense(req.user, req.ip, updateNamePayload);

  return res.send({
    birthdate: serializeDate(req.user.birthdate),
    firstName: req.user.firstName,
    lastName: req.user.lastName,
  });
}

export async function changePassword(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const changePasswordPayload = await UserValidator.validateChangePasswordRequest(req);

  await UserController.changePassword(req.user, changePasswordPayload);

  return res.send({ ok: true });
}

export async function confirmPassword(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  await UserValidator.validatePasswordConfirmRequest(req);

  dogstatsd.increment('user.password_confirm_success');
  return res.send({ ok: true });
}

export async function verifyResetPasswordCode(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const user = await UserValidator.validateResetPasswordVerifyCodeRequest(req);
  await UserController.sendResetPasswordEmail(user);
  return res.send();
}

export async function resetPassword(
  req: IDaveRequest,
  res: IDaveResponse<ResetPasswordEmailResponse>,
): Promise<Response> {
  const user = await UserValidator.validateResetPasswordRequest(req);
  const hasDaveBanking = Boolean(await user?.hasDaveBanking());
  if (user && !hasDaveBanking) {
    await UserController.sendResetPasswordEmail(user);
  }
  if (!user) {
    const { email } = getParams(req.body, [], ['email']);
    //TO-DO: remove this audit log in RAM-573
    AuditLog.create({
      userId: -1, // userId is required in this table but is never available in this scenario
      type: 'PASSWORD_RESET_USER_LOOKUP_FAILED',
      message: `password reset user could not be found`,
      extra: { email },
    });
  }
  return res.send({ userId: user?.id || null, hasDaveBanking });
}

export async function verifyDaveBankingSSN(
  req: IDaveRequest,
  res: IDaveResponse<VerifyDaveBankingSSNResponse>,
): Promise<Response> {
  const { ssnLast4, user, recoveryEmail } = await UserValidator.validateVerifyDaveBankingSSN(req);
  await UserController.verifyDaveBankingSSN(user, ssnLast4, recoveryEmail);
  const expiration = getExpiration(JWT_BANKING_VERIFIED_SSN_EXPIRATION);
  const token = encode({ userId: user.id, exp: expiration });
  return res.send({ phoneNumber: user.phoneNumber, token });
}

export async function verifyCode(
  req: IDaveRequest,
  res: IDaveResponse<{ token: string }>,
): Promise<Response> {
  const verifiedPhoneNumber = await UserValidator.validateVerifyCodeRequest(req);
  const token = encode({ phoneNumber: verifiedPhoneNumber });
  return res.send({ token });
}

export async function verifyAddressInfo(
  req: IDaveRequest,
  res: IDaveResponse<VerifyAddressResponse>,
) {
  const {
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
  } = UserValidator.validateVerifyAddressInfo(req);
  const response = await verifyAddress({
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
  });

  return res.send(response);
}

// Create/log in a user w/ the given phone number + code
export async function create(
  req: IDaveRequest,
  res: IDaveResponse<UserResponse>,
): Promise<Response> {
  const createUserPayload = await UserValidator.validateNewUserRequest(req);

  const appVersion: string = req.get('X-App-Version');

  const { user, userToken, deviceId, deviceType } = await UserController.createUser(
    appVersion,
    createUserPayload,
  );

  req.userToken = userToken;
  req.user = user;

  RequestResponseHelpers.setCookies(req, res, userToken, deviceId, deviceType);

  return get(req, res);
}

// Login with email/phoneNumber and password
export async function loginWithCredentials(
  req: IDaveRequest,
  res: IDaveResponse<UserResponse>,
): Promise<Response> {
  const loginPayload = await UserValidator.validateLoginRequest(req);

  const { user, userToken, loginMethod, deviceId, deviceType } = await UserController.loginUser(
    loginPayload,
  );

  req.userToken = userToken;
  req.user = user;
  dogstatsd.increment('user.login_with_password.success', { loginMethod });

  RequestResponseHelpers.setCookies(req, res, userToken, deviceId, deviceType);

  return get(req, res);
}

// Get firebase credentials needed for the frontend.
export async function getFirebaseCredentials(
  req: IDaveRequest,
  res: IDaveResponse<{ firebaseToken: string; uuid: string }>,
): Promise<Response> {
  const credentials = await Firebase.getToken();
  return res.send(credentials);
}

// Update a user's settings or profile fields
export async function update(
  req: IDaveRequest,
  res: IDaveResponse<UserResponse>,
): Promise<Response> {
  const validatedPayload = await UserValidator.validateUpdateUserRequest(req);

  await UserController.updateUser(
    req.user,
    { requestPayload: deepTrim(req.body) },
    validatedPayload,
  );

  return get(req, res);
}

// Delete a user's account
export async function del(req: IDaveRequest, res: Response) {
  const { id: userId, reason, additionalInfo } = validateDeleteUserRequest(req);
  await AccountManagement.removeUserAccountById({ userId, reason, options: { additionalInfo } });

  res.sendStatus(200);
}

export async function performAccountChecks(
  req: IDaveRequest,
  res: IDaveResponse<UserAccountChecks>,
) {
  const user = req.user;
  const accountChecks = await performUserAccountChecks(user.id);
  res.send(accountChecks);
}
