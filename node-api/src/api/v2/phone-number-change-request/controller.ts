import ErrorHelper from '@dave-inc/error-helper';
import { moment } from '@dave-inc/time-lib';
import * as uuid from 'uuid/v4';
import * as config from 'config';
import { ConflictError, InvalidVerificationError } from '../../../lib/error';
import logger from '../../../lib/logger';
import { broadcastPhoneUpdate } from '../../../domain/user-updates';
import { AuditLog, PhoneNumberChangeRequest, User, BankAccount, sequelize } from '../../../models';
import UserHelper from '../../../helper/user';
import sendgrid from '../../../lib/sendgrid';
import { RecoverableMySQLErrorCode } from '../../../lib/sequelize-helpers';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { InvalidParametersMessageKey } from '../../../translations';
import {
  CreatePhoneNumberChangeRequestParams,
  CreatePhoneNumberChangeRequestPayload,
} from './typings';

const DAVE_WEBSITE_URL = config.get('dave.website.url');

export async function createPhoneNumberChangeRequest({
  user,
  newPhoneNumber,
  oldPhoneNumber,
  code,
}: CreatePhoneNumberChangeRequestParams): Promise<CreatePhoneNumberChangeRequestPayload> {
  const validated = await UserHelper.validateVerificationCode(newPhoneNumber, code);
  if (!validated) {
    dogstatsd.increment('phone_number_change_request.invalid_code', { method: 'post' });
    throw new InvalidVerificationError(InvalidParametersMessageKey.InvalidVerificationCode, {
      name: 'invalid_code',
    });
  }

  dogstatsd.increment('phone_number_change_request.create_request', { method: 'create' });
  const changeRequest = await PhoneNumberChangeRequest.create({
    userId: user.id,
    oldPhoneNumber,
    newPhoneNumber,
    verificationCode: user.email ? uuid() : null,
  });

  const response: { id?: number; emailSent: boolean } = {
    emailSent: false,
  };

  if (user.email) {
    dogstatsd.increment('phone_number_change_request.email_sent');
    await sendgrid.send(
      'Dave | Verify phone number change',
      '2687eab7-972e-4b15-b165-200bbed648f1',
      {
        ACTION_URL: `${DAVE_WEBSITE_URL}/change-phone-number/${changeRequest.id}/${changeRequest.verificationCode}`,
      },
      user.email,
    );

    response.emailSent = true;
  } else {
    const bankAccounts = await BankAccount.findAll({ where: { userId: user.id } });
    if (bankAccounts.length > 0) {
      dogstatsd.increment('phone_number_change_request.bank_account_found');
      response.id = changeRequest.id;
    } else {
      dogstatsd.increment('phone_number_change_request.process_change', { method: 'create' });
      await processChange(changeRequest);
    }
  }

  await AuditLog.create({
    userId: user.id,
    type: `PHONE_NUMBER_CHANGE_REQUEST_CREATED`,
    successful: true,
    extra: {
      oldPhoneNumber,
      newPhoneNumber,
      emailSent: response.emailSent,
    },
  });

  return response;
}

export async function processChange({
  newPhoneNumber,
  userId,
  id,
}: {
  newPhoneNumber: string;
  userId: number;
  id: number;
}) {
  try {
    await sequelize.transaction(async transaction => {
      await PhoneNumberChangeRequest.update(
        { verified: moment() },
        { where: { id, userId }, transaction },
      );
      await User.update({ phoneNumber: newPhoneNumber }, { where: { id: userId }, transaction });
    });
  } catch (error) {
    if (error.original?.code === RecoverableMySQLErrorCode.Uniqueness) {
      const formattedError = ErrorHelper.logFormat(error);
      logger.error('Failed to update phone number change request', { error: formattedError });
      throw new ConflictError('User with this phone number already exists.');
    }
    throw error;
  }
  await broadcastPhoneUpdate(userId, newPhoneNumber);
}
