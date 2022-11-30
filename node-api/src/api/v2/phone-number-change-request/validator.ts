import { Request } from 'express';
import { AlreadyExistsError, NotFoundError } from '../../../lib/error';
import { User } from '../../../models';
import { toE164 } from '../../../lib/utils';
import { dogstatsd } from '../../../lib/datadog-statsd';
import {
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  RateLimitMessageKey,
} from '../../../translations';
import { checkIpRateLimit } from '../../../api/v2/user/check-ip-rate-limit';
import { RateLimiter } from '../../../lib/rate-limiter';
import { ValidCreateUserPayload } from './typings';
import amplitude from '../../../lib/amplitude';
import { AnalyticsEvent } from '../../../typings';

const createLimiter = new RateLimiter('changeNumberReq', [{ interval: 60, limit: 5 }]);

export async function validateCreate(req: Request): Promise<ValidCreateUserPayload> {
  const {
    ip,
    body: { oldPhoneNumber, newPhoneNumber },
  } = req;
  const oldPhone = toE164(oldPhoneNumber);
  const newPhone = toE164(newPhoneNumber);
  const amplitudeDeviceId = req.get('X-Amplitude-Device-ID');

  await Promise.all([
    checkIpRateLimit(ip, RateLimitMessageKey.TooManyRequests),
    createLimiter.incrementAndCheckLimit({
      key: `create-change-request:${oldPhone}`,
      message: RateLimitMessageKey.TooManyRequests,
      stat: 'phone_number_change_request.rate_limit',
    }),
    createLimiter.incrementAndCheckLimit({
      key: `create-change-request:${newPhone}`,
      message: RateLimitMessageKey.TooManyRequests,
      stat: 'phone_number_change_request.rate_limit',
    }),
  ]);

  const userForNewNumber = await User.findOneByPhoneNumber(newPhone);
  if (userForNewNumber) {
    if (amplitudeDeviceId) {
      amplitude.track({
        deviceId: amplitudeDeviceId,
        eventType: AnalyticsEvent.PhoneNumberChangeUnauthAlreadyExists,
      });
    }
    dogstatsd.increment('phone_number_change_request.number_exists');
    throw new AlreadyExistsError(InvalidParametersMessageKey.NewPhoneNumberAlreadyUsed);
  }

  const user = await User.findOneByPhoneNumber(oldPhone);
  if (!user) {
    if (amplitudeDeviceId) {
      amplitude.track({
        deviceId: amplitudeDeviceId,
        eventType: AnalyticsEvent.PhoneNumberChangeUnauthNotFound,
      });
    }
    dogstatsd.increment('phone_number_change_request.old_number_not_found');
    throw new NotFoundError(NotFoundMessageKey.PhoneNumberNotFound);
  }

  return { user, newPhoneNumber: newPhone, oldPhoneNumber: oldPhone };
}
