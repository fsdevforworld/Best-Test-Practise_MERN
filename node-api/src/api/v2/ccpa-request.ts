import { InvalidParametersError } from '../../lib/error';

import { CCPARequest } from '../../models';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { InvalidParametersMessageKey, RateLimitMessageKey } from '../../translations';
import { validateEmail } from '../../lib/utils';
import { RateLimiter } from '../../lib/rate-limiter';
import gcloudKms from '../../lib/gcloud-kms';
import sendgrid from '../../lib/sendgrid';
import logger from '../../lib/logger';
import { InvalidVerificationError } from '../../lib/error';

const rateLimiter = new RateLimiter('post-ccpa_request-check_duplicate', [
  { interval: 60, limit: 3 },
]);

async function create(req: IDaveRequest, res: IDaveResponse<string[]>) {
  await rateLimiter.incrementAndCheckLimit({
    key: req.get('X-Device-Id'),
    message: RateLimitMessageKey.TooManyRequests,
    stat: 'ccpa_request.check_duplicate.rate_limit',
  });

  const { firstName, lastName, email, birthdate, ssn, requestType, details } = req.body;

  if (!firstName || !lastName || !email || !birthdate || !ssn || !requestType || !details) {
    throw new InvalidParametersError(null, {
      required: ['firstName', 'lastName', 'email', 'birthdate', 'ssn', 'requestType', 'details'],
      provided: Object.keys(req.body),
    });
  }

  if (!moment(birthdate, MOMENT_FORMATS.BIRTHDATE_INPUT, true).isValid()) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidBirthdate);
  }

  if (!validateEmail(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  if (!['REQUEST', 'DELETION'].includes(requestType)) {
    throw new InvalidParametersError('Invalid requestType');
  }

  try {
    const { ciphertext } = await gcloudKms.encrypt(ssn);

    await CCPARequest.create({
      firstName,
      lastName,
      email,
      birthdate: moment(birthdate, MOMENT_FORMATS.BIRTHDATE_INPUT),
      ssn: ciphertext,
      requestType,
      details,
    });
  } catch (error) {
    const errorMessage = 'Error creating CCPA request record';
    logger.error(errorMessage, { error });
    throw new InvalidVerificationError(errorMessage);
  }

  try {
    await sendgrid.send(
      'Dave got your CCPA request',
      'd-a85f24c1b3544aeb86ce27a3f0209354',
      {},
      email,
    );
  } catch (error) {
    logger.error('Error sending CCPA request confirmation email', { error });
  }

  res.status(200).send();
}

export default { create };
