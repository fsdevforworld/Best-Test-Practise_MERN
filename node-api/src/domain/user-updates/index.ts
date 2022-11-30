import ErrorHelper from '@dave-inc/error-helper';
import { isEmpty, pickBy } from 'lodash';
import * as Synapsepay from '../../domain/synapsepay';
import { createUserAddress } from '../../domain/user-address';
import { mapCountryCodeFromState } from '../../helper/address';
import UserHelper from '../../helper/user';
import { Modifications, obfuscateEmail } from '../../lib/utils';
import * as Jobs from '../../jobs/data';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { EmailVerification, User } from '../../models';
import {
  AnalyticsEvent,
  UserUpdateFields,
  BrazeUpdateAttributes,
  BrazeUpdateEvent,
  IUserUpdatedEventData,
} from '../../typings';
import { Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { userUpdatedEvent } from '../event';
import validateBirthdate from './validate-birthdate';
import validateCoolOffWaive from './validate-cool-off-waive';
import validateFirstName from './validate-first-name';
import validateLastName from './validate-last-name';
import * as config from 'config';

const RISK_TOTAL_EMAIL_CHANGES_LOOKBACK_PERIOD =
  parseInt(config.get('risk.totalEmailChanges.lookbackDays'), 10) || 90;

async function broadcastPhoneUpdate(userId: number, phoneNumber: string) {
  if (!userId || !phoneNumber) {
    dogstatsd.increment('broadcast_phone_update.incomplete_payload');
    throw new Error('Incomplete payload for broadcastPhoneUpdate');
  }
  try {
    await Promise.all([
      Jobs.updateSynapsepayUserTask({ userId }),
      Jobs.updateBrazeTask({
        userId,
        attributes: { phoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      }),
      userUpdatedEvent.publish({ phoneChanged: true, userId }),
    ]);
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    dogstatsd.increment('broadcast_phone_update.failed');
    logger.error('Failed to broadcast phone number update', { userId, ...formattedError });
  }
  dogstatsd.increment('broadcast_phone_update.success');
}

async function broadcastEmailUnverified(
  userId: number,
  unverifiedEmail: string,
  oldEmail: string,
  url: string,
) {
  return Jobs.updateBrazeTask({
    userId,
    attributes: {
      email_verified: Boolean(oldEmail),
      unverified_email: unverifiedEmail,
    },
    eventProperties: {
      name: AnalyticsEvent.EmailUnverified,
      properties: {
        unverifiedEmail,
        obfuscatedEmail: obfuscateEmail(unverifiedEmail),
        url,
        sendEmail: true,
      },
    },
  });
}

async function broadcastEmailUpdate(user: User, previousEmail: string) {
  if (!user) {
    dogstatsd.increment('broadcast_email_update.incomplete_payload');
    throw new Error('Incomplete payload for broadcastEmailUpdate');
  }

  let identityVerification;
  try {
    const cutOff = moment().subtract(RISK_TOTAL_EMAIL_CHANGES_LOOKBACK_PERIOD, 'days');
    const totalEmailChanges = await EmailVerification.count({
      where: { userId: user.id, created: { [Op.gt]: cutOff } },
    });

    [identityVerification] = await Promise.all([
      UserHelper.verifyUserIdentity(user),
      Jobs.updateBrazeTask({
        userId: user.id,
        attributes: {
          email: user.email,
          email_verified: true,
          unverified_email: null,
        },
        eventProperties: {
          name: AnalyticsEvent.EmailUpdated,
          properties: { previousEmail, newEmail: user.email },
        },
      }),
      userUpdatedEvent.publish({ totalEmailChanges, emailChanged: true, userId: user.id }),
    ]);
    if (identityVerification.success) {
      await Jobs.updateSynapsepayUserTask({
        userId: user.id,
        options: {
          fields: { email: user.email },
        },
      });
    }
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    dogstatsd.increment('broadcast_email_update.failed');
    logger.error('Failed to broadcast email update', {
      ...formattedError,
      userId: user.id,
      identityVerification: identityVerification && identityVerification.status,
    });
  }
  dogstatsd.increment('broadcast_email_update.success');
}

async function broadcastPasswordUpdate(userId: number) {
  if (!userId) {
    dogstatsd.increment('broadcast_password_update.incomplete_payload');
    throw new Error('Incomplete payload for broadcastPasswordUpdate');
  }
  try {
    await Jobs.updateBrazeTask({
      userId,
      eventProperties: { name: AnalyticsEvent.PasswordUpdated },
    });
  } catch (error) {
    const formattedError = ErrorHelper.logFormat(error);
    dogstatsd.increment('broadcast_password_update.failed');
    logger.error('Failed to broadcast password update', {
      ...formattedError,
      userId,
    });
  }
  dogstatsd.increment('broadcast_password_update.success');
}

function aggregateBroadcastCalls({
  userId,
  modifications,
  updateFields,
  updateSynapse,
}: {
  userId: number;
  modifications: Modifications;
  updateFields: UserUpdateFields;
  updateSynapse: boolean;
}) {
  const attributes: BrazeUpdateAttributes = {};
  const eventProperties: BrazeUpdateEvent[] = [];
  const userUpdateEventPayload: Omit<IUserUpdatedEventData, 'userId'> = {};
  const promises: Array<Promise<any>> = [];

  if (hasNameChange(modifications)) {
    attributes.firstName = updateFields.firstName;
    attributes.lastName = updateFields.lastName;
    eventProperties.push({
      name: AnalyticsEvent.NameUpdated,
    });
    userUpdateEventPayload.nameChanged = true;
  }

  if (hasAddressChange(modifications)) {
    attributes.city = updateFields.city;
    attributes.country = mapCountryCodeFromState(updateFields.state);
    eventProperties.push({
      name: AnalyticsEvent.AddressUpdated,
    });
    userUpdateEventPayload.addressChanged = true;
    promises.push(
      createUserAddress(userId, {
        addressLine1: updateFields.addressLine1,
        addressLine2: updateFields.addressLine2,
        city: updateFields.city,
        state: updateFields.state,
        zipCode: updateFields.zipCode,
      }),
    );
  }

  if (modifications.birthdate) {
    attributes.birthdate = updateFields.birthdate.format('YYYY-MM-DD');
  }

  if (modifications.phoneNumber) {
    attributes.phoneNumber = modifications.phoneNumber.currentValue;
    eventProperties.push({ name: AnalyticsEvent.PhoneNumberUpdated });
    userUpdateEventPayload.phoneChanged = true;
  }

  const hasChanges = !isEmpty(attributes) || !isEmpty(eventProperties);

  if (hasChanges) {
    promises.push(Jobs.updateBrazeTask({ userId, attributes, eventProperties }));
  }

  if (!isEmpty(userUpdateEventPayload)) {
    promises.push(userUpdatedEvent.publish({ userId, ...userUpdateEventPayload }));
  }

  if (hasChanges && updateSynapse) {
    const synapseFields = Synapsepay.mapToSynapseFields(updateFields);
    // task expects only userId when only phone is updated
    const payload =
      isEmpty(pickBy(synapseFields)) && modifications.phoneNumber
        ? { userId }
        : { userId, options: { fields: synapseFields } };
    promises.push(Jobs.updateSynapsepayUserTask(payload));
  }

  return promises;
}

function hasAddressChange(modifications: Modifications): boolean {
  return Object.keys(modifications).some(mod =>
    ['addressLine1', 'addressLine2', 'city', 'state', 'zipCode'].includes(mod),
  );
}

function hasNameChange(modifications: Modifications): boolean {
  return Object.keys(modifications).some(mod => ['firstName', 'lastName'].includes(mod));
}

export {
  aggregateBroadcastCalls,
  broadcastEmailUnverified,
  broadcastEmailUpdate,
  broadcastPasswordUpdate,
  broadcastPhoneUpdate,
  validateBirthdate,
  validateCoolOffWaive,
  validateFirstName,
  validateLastName,
};
