import redisClient from '../../src/lib/redis';
import { toE164 } from '../../src/lib/utils';

export default async function createVerificationCode({
  phoneNumber,
  code,
}: {
  phoneNumber?: string;
  code?: string;
}) {
  const number = toE164(phoneNumber);
  await redisClient.hmsetAsync(number, 'code', code);
}
