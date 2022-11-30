import { User } from '../../models';
import fetchUserFromSynapsepay from './fetch-user-from-synapsepay';
import getFingerprint from './get-fingerprint';

interface IOptions {
  synapsepayUserId?: string;
  includeOauthKey?: boolean;
}

async function getUserHeader(
  user: User,
  { synapsepayUserId, includeOauthKey = true }: IOptions = { includeOauthKey: true },
): Promise<{ 'X-SP-USER': string }> {
  let oauthKey = '';

  if (includeOauthKey) {
    ({ oauth_key: oauthKey } = await fetchUserFromSynapsepay(user, {
      synapsepayUserId,
    }));
  }
  const fingerprint = await getFingerprint(user);

  return { 'X-SP-USER': `${oauthKey}|${fingerprint}` };
}

export default getUserHeader;
