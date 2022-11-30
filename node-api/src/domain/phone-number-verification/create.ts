import { generateMFACode, isDevEnv } from '../../lib/utils';
import { PhoneNumberVerification } from '../../typings';
import redis from '../../lib/redis';
import find from './find';
import * as config from 'config';

const codeTtl = config.get<number>('phoneNumbers.verificationTtl');

export default async function create({
  e164PhoneNumber,
  carrierName,
  carrierCode,
}: {
  e164PhoneNumber: string;
  carrierName: string;
  carrierCode: string;
}): Promise<PhoneNumberVerification> {
  const cached = await find(e164PhoneNumber);
  const verification: PhoneNumberVerification = {
    code: isDevEnv() ? '111111' : generateMFACode(),
    carrierCode,
    carrierName,
    sendCount: cached?.sendCount ?? 0,
  };

  await redis.hmsetAsync(e164PhoneNumber, verification);
  await redis.expireAsync(e164PhoneNumber, codeTtl);

  return verification;
}
