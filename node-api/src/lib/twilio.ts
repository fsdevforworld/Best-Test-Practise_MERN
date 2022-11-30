import * as Bluebird from 'bluebird';
// tslint:disable-next-line:no-require-imports
import Twilio = require('twilio');
import * as changeCase from 'change-case';
import { get } from 'lodash';
import { isProdEnv, isTestEnv, validateE164 } from './utils';
import { NotSupportedError, InvalidParametersError, TwilioError } from './error';
import { MobileInfo } from '../../src/typings/phone-number-verification';
import { dogstatsd } from './datadog-statsd';
import * as config from 'config';
import logger from './logger';

const TWILIO_MESSAGING_SID: string = config.get('twilio.messagingSid');
const TWILIO_SID: string = config.get('twilio.sid');
const TWILIO_SECRET: string = config.get('twilio.secret');
const TWILIO_PHONE_NUMBER: string = config.get('twilio.phoneNumber');
const failingService = 'twilio';
const gatewayService = 'node-api';

if (!TWILIO_MESSAGING_SID || !TWILIO_SID || !TWILIO_SECRET || !TWILIO_PHONE_NUMBER) {
  throw new Error(
    'TWILIO_SID and TWILIO_SECRET and TWILIO_PHONE_NUMBER environment variables are not set on host',
  );
}

const twilioClient = new Twilio(TWILIO_SID, TWILIO_SECRET);
const TWILIO_INVALID_NUMBER_CODE = 20404;

/* from Twilio docs (https://www.twilio.com/console/add-ons/XB1bdc05aa1e32754917740eca84f73612?)
 * Values returned are:
 * Y ? (Yes) Ownership has not changed.
 * N ? (No) Ownership may have changed.
 * I ? (Indeterminable) Used when the MSISDN is associated with a non-mobile number.
 */
enum TwilioOwnership {
  Unchanged = 'Y',
  MayHaveChanged = 'N',
  Indeterminable = 'I',
}

async function checkForContractChange(phoneNumber: string, date: string): Promise<boolean> {
  if (!validateE164(phoneNumber)) {
    throw new InvalidParametersError('Phone number not valid E164');
  }

  if (!isProdEnv()) {
    const contractChangedPhones = config.get<string[]>('phoneNumbers.triggerContractChange');
    return contractChangedPhones.includes(phoneNumber) ? true : null;
  }

  const payload = {
    addOns: 'payfone_tcpa_compliance',
    addOnsData: {
      'payfone_tcpa_compliance.RightPartyContactedDate': date,
    },
  };

  const response = await twilioClient.lookups.phoneNumbers(phoneNumber).fetch(payload);

  const tcpaData = get(response, 'addOns.results.payfone_tcpa_compliance.result');

  // 0 is the only success code. For a list of all codes, véase https://www.twilio.com/console/add-ons/XB1bdc05aa1e32754917740eca84f73612?
  if (tcpaData.Status !== 0) {
    throw new TwilioError('TCPA compliance check failed', {
      data: response,
      failingService,
      gatewayService,
    });
  }

  if (tcpaData.Response.NumberMatch === TwilioOwnership.Unchanged) {
    return false;
  } else if (tcpaData.Response.NumberMatch === TwilioOwnership.MayHaveChanged) {
    return true;
  } else if (tcpaData.Response.NumberMatch === TwilioOwnership.Indeterminable) {
    throw new TwilioError(
      'This phone number does not fall under TCPA jurisdiction as it is not a mobile phone number.',
    );
  } else {
    throw new TwilioError('Unknown Twilio response received', {
      data: response,
      failingService,
      gatewayService,
    });
  }
}

async function send(body: string, to: string, mediaUrl: string = undefined): Promise<any> {
  if (!isTestEnv() && config.get('phoneNumbers.easyVerification')) {
    return Bluebird.resolve();
  }

  // twilio send will fail if mediaUrl is null
  if (mediaUrl === null) {
    mediaUrl = undefined;
  }

  return twilioClient.messages
    .create({
      body,
      to,
      messagingServiceSid: TWILIO_MESSAGING_SID,
      mediaUrl,
    })
    .catch((err: any) => {
      logger.error('A problem occurred sending text message. Please try again', { err });
      dogstatsd.increment('phone_number_verification.sms.delivery.failed');
      throw new NotSupportedError(
        err.code === 21610 ? 'Phone number has unsubscribed.' : `Error sending message to ${to}`,
        { data: err },
      );
    });
}

async function lookup(phoneNumber: string, type: string): Promise<any> {
  if (!validateE164(phoneNumber)) {
    throw new InvalidParametersError('Phone number not valid E164');
  }

  try {
    const result = await twilioClient.lookups.phoneNumbers(phoneNumber).fetch({ type });

    return result;
  } catch (err) {
    // Twilio will fail if the number is not possible for the region.
    if (err.code === TWILIO_INVALID_NUMBER_CODE) {
      throw new InvalidParametersError('Phone number not valid');
    }

    throw err;
  }
}

async function getMobileInfo(phoneNumber: string): Promise<MobileInfo> {
  const { carrier } = await lookup(phoneNumber, 'carrier');
  const { name, type, error_code, mobile_country_code, mobile_network_code } = carrier;
  const isMobile = type === 'mobile';
  const carrierName = name && name.toLowerCase();
  const carrierCode = `${mobile_country_code}|${mobile_network_code}`;
  dogstatsd.increment('twilio_phone_number_lookup_carrier', {
    name,
    type,
    error_code,
    carrier_code: carrierCode,
  });
  if (!isMobile) {
    logger.info('Phone labeled voip', { phoneNumber, info: carrier });
  }
  return { isMobile, carrierName, carrierCode };
}

async function getName(phoneNumber: string): Promise<{ firstName: string; lastName: string }> {
  if (!isProdEnv()) {
    return null;
  }

  const result = await lookup(phoneNumber, 'caller-name');

  const fullName = get(result, 'callerName.caller_name') as string;
  if (!fullName) {
    return null;
  }

  const [firstName, ...rest] = changeCase.title(fullName).split(' ');

  return {
    firstName,
    lastName: rest.join(' '),
  };
}

export default { send, getName, checkForContractChange, getMobileInfo };
