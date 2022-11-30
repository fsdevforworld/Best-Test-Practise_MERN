import { User as SynapsePayUser, DehydratedUser } from 'synapsepay';
import { User } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import { users, helpers } from './external-model-definitions';
import authenticationClient from './authentication-client';
import Constants from './constants';
import getFingerprint from './get-fingerprint';
import { addToCache } from './alternate-fingerprint-cache';

function getSynapsepayUser(synapsepayUserId: string, fingerprint: string) {
  return users.getAsync(authenticationClient, {
    _id: synapsepayUserId,
    ip_address: helpers.getUserIP(),
    fingerprint,
    full_dehydrate: 'yes',
  });
}

async function handleFingerprintError(
  ex: any,
  user: User,
  synapsepayUserId: string,
): Promise<SynapsePayUser<DehydratedUser>> {
  const parsedError = ex?.body?.error_code;
  if (parsedError !== Constants.SYNAPSEPAY_USER_FINGERPRINT_ERROR_CODE) {
    throw ex;
  }

  dogstatsd.increment('synapsepay.get_user.fingerprint_error');

  const fingerprint = await getFingerprint(user, { forceAlternateSecret: true });
  const synapsepayUser = await getSynapsepayUser(synapsepayUserId, fingerprint);

  await addToCache(user.id);
  dogstatsd.increment('synapsepay.get_user.fingerprint_error.resolved.new_fingerprint_match');

  return synapsepayUser;
}

async function fetchUserFromSynapsepay(
  user: User,
  { synapsepayUserId }: { synapsepayUserId?: string } = {},
): Promise<SynapsePayUser<DehydratedUser>> {
  const fingerprint = await getFingerprint(user);
  const id = synapsepayUserId || user.synapsepayId;

  return getSynapsepayUser(id, fingerprint).catch(ex => handleFingerprintError(ex, user, id));
}

export default fetchUserFromSynapsepay;
