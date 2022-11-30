import * as config from 'config';
import { isNil } from 'lodash';
import { VerificationInfoResponse } from '@dave-inc/wire-typings';
import amplitude from '../../lib/amplitude';
import { dogstatsd } from '../../lib/datadog-statsd';
import { moment } from '@dave-inc/time-lib';
import redisClient from '../../lib/redis';
import twilio from '../../lib/twilio';
import { User } from '../../models';
import AccountManagement from '../../domain/account-management';
import logger from '../../lib/logger';
import UserHelper from '../../helper/user';

export default async function checkForContractChange(
  user: User,
  isSignUp: boolean,
  forgotPassword?: boolean,
): Promise<VerificationInfoResponse> {
  let isContractChanged;
  const key = `twilioContractChangeCheck:${user.phoneNumber}`;
  const cachedResults: string = await redisClient.getAsync(key);
  if (!isNil(cachedResults)) {
    isContractChanged = parseInt(cachedResults, 10);
  } else {
    isContractChanged = await makeTwilioContractChangeCall(user, { isSignUp, forgotPassword });
    const expiration: number = config.get('phoneNumbers.contractChangeTtl');
    await redisClient.setexAsync(key, expiration, isContractChanged ? 1 : 0);
  }

  if (config.get('phoneNumbers.shouldSendVerificationCode')) {
    // We only want to send verification during certain situations
    // because those are the only times we will see verify code screen
    const hasNoContractChangeDuringLogin = !isContractChanged && !isSignUp && !forgotPassword;
    const hasContractChangeDuringSignUp = isContractChanged && isSignUp;
    if (hasNoContractChangeDuringLogin || hasContractChangeDuringSignUp || forgotPassword) {
      await UserHelper.sendVerificationCode({ phoneNumber: user.phoneNumber });
    }
  }

  const tags = {
    is_sign_up: isSignUp.toString(),
    forgot_password: Boolean(forgotPassword).toString(),
  };
  if (isContractChanged) {
    dogstatsd.increment('phone_number_verification.check_for_contract_change.true', tags);
    // contract has changed, so this is a completely new user
    const reason = 'TCPA contract change detected';
    const additionalInfo = 'new user attempting to use existing number that has changed contracts';
    await AccountManagement.removeUserAccountById({
      userId: user.id,
      reason,
      options: {
        additionalInfo,
        shouldOverrideSixtyDayDelete: true,
      },
    });
    return {
      hasProvidedEmailAddress: false,
      hasCreatedPassword: false,
      hasTwilioContractChanged: true,
    };
  } else {
    dogstatsd.increment('phone_number_verification.check_for_contract_change.false', tags);

    return {
      hasProvidedEmailAddress: false,
      hasCreatedPassword: false,
      hasTwilioContractChanged: false,
    };
  }
}

async function makeTwilioContractChangeCall(
  user: User,
  metrics: { isSignUp: boolean; forgotPassword: boolean },
): Promise<boolean> {
  let isContractChanged: boolean;
  try {
    isContractChanged = await twilio.checkForContractChange(
      user.phoneNumber,
      moment(user.created).format('YYYYMMDD'),
    );
    amplitude.track({
      userId: user.id,
      eventType: amplitude.EVENTS.TWILIO_CONTRACT_CHANGE_CHECK,
      eventProperties: {
        isSignUp: metrics.isSignUp,
        isForgotPassword: metrics.forgotPassword,
        isContractChanged,
      },
    });
  } catch (error) {
    // Sometimes Twilio errors out with 'TwilioError: TCPA compliance check failed'
    logger.error('Twilio contract change check failed', { userId: user.id, error });
    isContractChanged = false;
  }
  return isContractChanged;
}
