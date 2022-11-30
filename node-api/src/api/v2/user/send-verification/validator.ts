import { Request } from 'express';
import { ValidSendCodePayload } from '../../user/typings';
import { InvalidParametersError } from '../../../../lib/error';
import { InvalidParametersMessageKey, RateLimitMessageKey } from '../../../../translations';
import { checkRateLimit, createRateLimiter } from '../../user/rate-limit';
import { toE164, validatePhoneNumber, validateEmail } from '../../../../lib/utils';

export const sendCodeRateLimiterKey = 'send-code';
export const sendCodeRateLimiterRules = [
  { interval: 60, limit: 2, precision: 10 },
  { interval: 3600, limit: 10, precision: 60 },
];

function isPhoneNumber(maybePhoneNumber: unknown): maybePhoneNumber is string {
  if (typeof maybePhoneNumber !== 'string') {
    return false;
  }
  return validatePhoneNumber(maybePhoneNumber);
}

function isMaybeEmailAddress(maybeEmail: unknown): maybeEmail is string | undefined | null {
  if (typeof maybeEmail === 'undefined' || maybeEmail === null) {
    return true;
  }
  if (typeof maybeEmail !== 'string') {
    return false;
  }
  return validateEmail(maybeEmail);
}

export async function validateSendMfaCodeRequest(req: Request): Promise<ValidSendCodePayload> {
  const { email, phoneNumber } = req.body;
  if (!isPhoneNumber(phoneNumber)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidPhoneNumberEntry);
  }

  if (!isMaybeEmailAddress(email)) {
    throw new InvalidParametersError(InvalidParametersMessageKey.InvalidEmailEntry);
  }

  const e164PhoneNumber = toE164(phoneNumber);

  const ip = req.ip;
  const deviceId = req.get('X-Device-Id');
  const rateLimitValues = { deviceId, ip };

  const rateLimiter = createRateLimiter(sendCodeRateLimiterKey, sendCodeRateLimiterRules);

  await checkRateLimit({
    rateLimiter,
    rateLimitValues,
    errorMessage: RateLimitMessageKey.TooManySendCodeAttemptsTryLater,
    prefix: sendCodeRateLimiterKey,
    ip,
  });

  return { phoneNumber: e164PhoneNumber, email };
}
