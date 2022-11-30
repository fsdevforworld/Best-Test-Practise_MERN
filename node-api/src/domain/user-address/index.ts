import { UserAddress } from '../../models';
import * as AddressVerification from '../../lib/address-verification';
import logger from '../../lib/logger';

export async function createUserAddress(
  userId: number,
  {
    addressLine1,
    addressLine2,
    city,
    state,
    zipCode,
  }: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  } = {},
) {
  if (AddressVerification.isAddressComplete({ addressLine1, city, state, zipCode })) {
    await UserAddress.create({
      userId,
      addressLine1,
      addressLine2,
      city,
      state,
      zipCode,
    });
  } else {
    logger.warn('Ignore incomplete address for', {
      payload: { userId },
    });
  }
}
