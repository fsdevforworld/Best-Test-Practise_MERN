import logger from './logger';
import * as request from 'superagent';
import { moment } from '@dave-inc/time-lib';
import { isProdEnv, validateE164 } from './utils';
import { InvalidParametersError } from './error';

export default {
  isMobile,
};

const { PAYFONE_CLIENT_ID } = process.env;

let PAYFONE_VERIFY_URL: string;
if (isProdEnv()) {
  PAYFONE_VERIFY_URL = 'http://payfone-proxy/verify/2014/10/01/verifyPhoneNumber';
} else {
  // dev URL (have to enable port 80 on payfone-proxy to test)
  PAYFONE_VERIFY_URL = 'http://35.232.9.224/verify/2014/10/01/verifyPhoneNumber';
}

export async function isMobile(phoneNumber: string): Promise<boolean> {
  if (!validateE164(phoneNumber)) {
    throw new InvalidParametersError('Phone number not valid E164');
  }

  try {
    const result = await request.post(PAYFONE_VERIFY_URL).send({
      RequestId: moment().valueOf(),
      ApiClientId: PAYFONE_CLIENT_ID,
      MobileNumber: phoneNumber,
      RightPartyContactedDate: moment().format('YYYY-MM-DD'),
    });

    if (result.body.Status === 0 && result.body.Response.MSISDNType === 'Mobile') {
      return true;
    } else if (result.body.Status === 1005) {
      return true;
    } else {
      logger.error('Phone number type not mobile', {
        phoneNumber,
        body: result.body,
      });
      return false;
    }
  } catch (err) {
    logger.error('Failed to get phone number type', { phoneNumber, err });
    return false;
  }
}
