import phoneNumberCreate from './';
import create from './create';
import { PhoneNumberVerificationDeliveryMethod } from '../../typings';
import redis from '../../lib/redis';

export default async function send({
  e164PhoneNumber,
  carrierName,
  carrierCode,
  email,
}: {
  e164PhoneNumber: string;
  carrierName: string;
  carrierCode: string;
  email?: string;
}): Promise<void> {
  const verification = await create({ e164PhoneNumber, carrierName, carrierCode });
  const deliveryMethod = email
    ? PhoneNumberVerificationDeliveryMethod.EMAIL
    : verification.sendCount > 0
    ? PhoneNumberVerificationDeliveryMethod.EMAIL_TO_SMS
    : PhoneNumberVerificationDeliveryMethod.SMS;
  await phoneNumberCreate.deliver({ e164PhoneNumber, verification, deliveryMethod, email });
  await incrementSendCount(e164PhoneNumber);
}

function incrementSendCount(e164PhoneNumber: string): Promise<number> {
  return redis.hincrbyAsync(e164PhoneNumber, 'sendCount', 1);
}
