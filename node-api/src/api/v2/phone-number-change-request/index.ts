import { Request, Response } from 'express';
import * as config from 'config';
import { moment } from '@dave-inc/time-lib';
import { UserResponse } from '@dave-inc/wire-typings';
import {
  AlreadyExistsError,
  ConflictError,
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  InvalidVerificationError,
  NotFoundError,
} from '../../../lib/error';

import { BankAccount, PhoneNumberChangeRequest, User } from '../../../models';
import AccountManagement from '../../../domain/account-management';
import UserHelper from '../../../helper/user';
import { toE164 } from '../../../lib/utils';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { RateLimiter } from '../../../lib/rate-limiter';
import * as UserAPI from '../user';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { InvalidParametersMessageKey, NotFoundMessageKey } from '../../../translations';
import { validateCreate } from './validator';
import { processChange, createPhoneNumberChangeRequest } from './controller';

export const MIN_VERSION = config.get<string>('minAppVersion.phoneNumberChange');

const updateLimiter = new RateLimiter('changeNumberReq', [{ interval: 86400, limit: 5 }]);

async function post(
  req: Request,
  res: IDaveResponse<{ id: number; emailSent: boolean }>,
): Promise<Response> {
  const { user, newPhoneNumber, oldPhoneNumber } = await validateCreate(req);
  const response = await createPhoneNumberChangeRequest({
    user,
    newPhoneNumber,
    oldPhoneNumber,
    code: req.body.code,
  });
  return res.status(201).send(response);
}

async function update(req: Request, res: IDaveResponse<{ success: boolean }>): Promise<Response> {
  const phoneNumberChangeRequest = await PhoneNumberChangeRequest.findByPk(req.params.id, {
    include: [User],
  });
  const { verificationCode, userId } = phoneNumberChangeRequest;
  const { verificationCode: lastFour } = req.body;

  if (verificationCode) {
    dogstatsd.increment('phone_number_change_request.invalid_code', { method: 'update' });
    throw new InvalidParametersError(InvalidParametersMessageKey.VerificationCode);
  }

  await updateLimiter.incrementAndCheckLimit({
    key: String(userId),
    message: 'Too many requests. Please try again in 24 hours',
    stat: 'phone_number_change_request.rate_limit',
  });

  verifyRequestIsNotExpired(phoneNumberChangeRequest);
  await processWithLastFour(phoneNumberChangeRequest, lastFour);

  return res.status(200).send();
}

async function verify(req: Request, res: IDaveResponse<{ success: boolean }>): Promise<Response> {
  const phoneNumberChangeRequest = await PhoneNumberChangeRequest.findByPk(req.params.id, {
    include: [User],
  });

  if (!phoneNumberChangeRequest) {
    dogstatsd.increment('phone_number_change_request.request_not_found');
    throw new NotFoundError(NotFoundMessageKey.PhoneNumberChangeRequestNotFound);
  }

  const { verificationCode } = phoneNumberChangeRequest;

  if (verificationCode !== req.query.verificationCode) {
    dogstatsd.increment('phone_number_change_request.invalid_code', { method: 'verify' });
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidVerificationCode, {
      customCode: CUSTOM_ERROR_CODES.INVALID_VERIFICATION_CODE,
    });
  }

  verifyRequestIsNotExpired(phoneNumberChangeRequest);

  dogstatsd.increment('phone_number_change_request.process_change', { method: 'verify' });
  await processChange(phoneNumberChangeRequest);

  return res.send({ success: true });
}

/**
 * Change phone number for a logged in user (profile page)
 * Difference between this method:
 * 1) verifyWithText does not check email/bank account
 * 2) verifyWithText returns a user so that we can update user on client
 */
async function verifyWithText(
  req: IDaveRequest,
  res: IDaveResponse<UserResponse>,
): Promise<Response> {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    dogstatsd.increment('phone_number_change_request.invalid_parameters', {
      method: 'verifyWithText',
    });
    throw new InvalidParametersError(null, {
      required: ['phoneNumber', 'code'],
      provided: Object.keys(req.body),
    });
  }

  const oldPhoneNumber = toE164(req.user.phoneNumber);
  const newPhoneNumber = toE164(phoneNumber);
  const user = await User.findOneByPhoneNumber(newPhoneNumber);
  if (user && user.id !== req.user.id) {
    dogstatsd.increment('phone_number_change_request.already_linked');
    throw new AlreadyExistsError(InvalidParametersMessageKey.PhoneNumberAlreadyLinkedToAnAccount, {
      name: 'phone_number_in_use',
    });
  }

  const validated = await UserHelper.validateVerificationCode(newPhoneNumber, code);
  if (!validated) {
    dogstatsd.increment('phone_number_change_request.invalid_code', { method: 'verifyWithText' });
    throw new InvalidVerificationError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
      name: 'invalid_code',
    });
  }

  // change request history
  dogstatsd.increment('phone_number_change_request.create_request', { method: 'verifyWithText' });
  const changeRequest = await PhoneNumberChangeRequest.create({
    userId: req.user.id,
    oldPhoneNumber,
    newPhoneNumber,
  });
  dogstatsd.increment('phone_number_change_request.process_change', { method: 'verifyWithText' });
  await processChange(changeRequest);

  await req.user.update({ phoneNumber: newPhoneNumber });

  return UserAPI.get(req, res);
}

async function processWithLastFour(changeRequest: PhoneNumberChangeRequest, lastFour: string) {
  const { userId } = changeRequest;

  if (!lastFour || lastFour.length !== 4) {
    dogstatsd.increment('phone_number_change_request.invalid_parameters', {
      method: 'processWithLastFour',
    });
    throw new InvalidParametersError(null, {
      required: ['verificationCode'],
      provided: [],
    });
  }

  if (lastFour.length !== 4) {
    dogstatsd.increment('phone_number_change_request.invalid_parameters', {
      method: 'processWithLastFour',
    });
    throw new InvalidParametersError(InvalidParametersMessageKey.WrongLengthForVerificationCode);
  }

  const possibleAccounts = await BankAccount.findAll({ where: { userId } });
  const lastFourMatches = possibleAccounts.some(account => {
    if (account.lastFour && account.lastFour.length > 2) {
      return account.lastFour === lastFour.slice(4 - account.lastFour.length);
    } else {
      return false;
    }
  });

  if (!lastFourMatches) {
    dogstatsd.increment('phone_number_change_request.wrong_digits');
    throw new InvalidParametersError(InvalidParametersMessageKey.WrongDigits);
  }

  dogstatsd.increment('phone_number_change_request.process_change', {
    method: 'processWithLastFour',
  });
  return processChange(changeRequest);
}

function verifyRequestIsNotExpired(changeRequest: PhoneNumberChangeRequest) {
  const { oldPhoneNumber, user, verified, created } = changeRequest;

  const isExpired = moment(created)
    .add(24, 'hours')
    .isBefore(moment());
  if (oldPhoneNumber !== user.phoneNumber || verified || isExpired) {
    throw new ConflictError(InvalidParametersMessageKey.ChangeRequestExpired, {
      customCode: CUSTOM_ERROR_CODES.CHANGE_REQUEST_EXPIRED,
    });
  }
}

async function reclaimPreviousAccount(req: IDaveRequest, res: Response): Promise<Response> {
  const newUserId = req.user.id;
  const { oldPhoneNumber, newPhoneNumber, accountNumber } = req.body;

  if (!newUserId || !oldPhoneNumber || !newPhoneNumber || !accountNumber) {
    dogstatsd.increment('phone_number_change_request.invalid_parameters', { method: 'reclaim' });
    throw new InvalidParametersError(null, {
      required: ['newUserId', 'oldPhoneNumber', 'newPhoneNumber', 'accountNumber'],
      provided: Object.keys(req.body),
    });
  }

  const previousUser = await User.findOneByPhoneNumber(oldPhoneNumber);
  if (!previousUser) {
    dogstatsd.increment('phone_number_change_request.reclaim_no_previous_user');
    throw new InvalidParametersError(InvalidParametersMessageKey.PhoneNumberAccountsDoNotMatch, {
      customCode: CUSTOM_ERROR_CODES.DUPLICATE_ACCOUNTS_DO_NOT_MATCH,
    });
  }

  const oldNumberAccounts = await BankAccount.getSupportedAccountsByUserNotDeletedOrDefault(
    previousUser,
  );
  const matchedAccount = oldNumberAccounts.find(account => account.accountNumber === accountNumber);

  if (matchedAccount) {
    dogstatsd.increment('phone_number_change_request.create_request', {
      method: 'reclaimPreviousAccount',
    });
    const changeRequest = await PhoneNumberChangeRequest.create({
      userId: previousUser.id,
      oldPhoneNumber,
      newPhoneNumber,
    });

    // Deletes the duplicate account that was just created. By sending over the
    // reason 'duplicate account', we are automatically adding the override_sixty_day_delete
    // flag so that this user is able to login.
    await AccountManagement.removeUserAccountById({
      userId: newUserId,
      reason: 'duplicate account',
      options: {
        additionalInfo:
          'User received a duplicate account error and selected that they had a new phone number.',
      },
    });
    dogstatsd.increment('phone_number_change_request.process_change', {
      method: 'reclaimPreviousAccount',
    });
    await processChange(changeRequest);
  } else {
    dogstatsd.increment('phone_number_change_request.reclaim_mismatch');
    throw new InvalidParametersError(InvalidParametersMessageKey.PhoneNumberAccountsDoNotMatch, {
      customCode: CUSTOM_ERROR_CODES.DUPLICATE_ACCOUNTS_DO_NOT_MATCH,
    });
  }

  return res.status(200).send();
}

export default { post, update, verify, verifyWithText, reclaimPreviousAccount };
