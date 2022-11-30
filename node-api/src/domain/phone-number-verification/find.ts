import { isNumber, isString } from 'lodash';
import { PhoneNumberVerification } from '../../typings';
import redis from '../../../src/lib/redis';

export default async function find(phoneNumber: string): Promise<PhoneNumberVerification> {
  const result = await redis.hgetallAsync<PhoneNumberVerification>(phoneNumber);
  if (isString(result?.sendCount)) {
    const parsed = parseInt(result.sendCount, 10);
    if (isNumber(parsed)) {
      result.sendCount = parsed;
    }
  }
  return result;
}
