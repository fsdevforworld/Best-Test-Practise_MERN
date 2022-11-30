import find from './find';
import { get } from 'lodash';
import { toE164 } from '../../lib/utils';

export default async function verify(
  phoneNumber: string,
  code: string,
  overrideCode?: string,
): Promise<boolean> {
  if (!code) {
    return false;
  }
  const parsedNumber = toE164(phoneNumber);
  const verification = await find(parsedNumber);
  return get(verification, 'code') === code || code === overrideCode;
}
