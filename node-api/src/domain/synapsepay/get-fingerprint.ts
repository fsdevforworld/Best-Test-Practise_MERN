import * as crypto from 'crypto';
import Constants from './constants';
import { isCached } from './alternate-fingerprint-cache';
import { SynapsePayUserDetails } from './core';

function getUserId(userOrId: SynapsePayUserDetails | number): number {
  let userId;
  if (typeof userOrId !== 'number') {
    userId = userOrId.legacyId || userOrId.id;
  } else {
    userId = userOrId;
  }

  return userId;
}

export default async function getFingerprint(
  userOrUserId: SynapsePayUserDetails | number,
  { forceAlternateSecret = false }: { forceAlternateSecret?: boolean } = {},
): Promise<string> {
  const userId = getUserId(userOrUserId);
  const useAlternateSecret = forceAlternateSecret || (await isCached(userId));

  const key = `${userId}:${Constants.SYNAPSEPAY_CLIENT_ID}:${
    useAlternateSecret
      ? Constants.SYNAPSEPAY_ALTERNATE_FINGERPRINT_SECRET
      : Constants.SYNAPSEPAY_USER_FINGERPRINT_SECRET
  }`;

  return crypto
    .createHash('md5')
    .update(key)
    .digest('hex');
}
