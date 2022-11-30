import * as crypto from 'crypto';
import { expect } from 'chai';
import * as config from 'config';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import redis from '../../../src/lib/redis';
import { getFingerprint } from '../../../src/domain/synapsepay';
import { User } from '../../../src/models';

const {
  userFingerprintSecret,
  alternateFingerprintSecret,
  clientId,
  userFingerprintRedisKey,
} = config.get('synapsepay');

describe('getFingerprint', () => {
  before(() => clean());

  afterEach(() => clean());

  it('creates an MD5 hash of the userId and synapse clientId and fingerprint secret', async () => {
    const userId = 5;

    const actual = await getFingerprint(userId);
    const expected = crypto
      .createHash('md5')
      .update(`${userId}:${clientId}:${userFingerprintSecret}`)
      .digest('hex');

    expect(actual).to.equal(expected);
  });

  it('handles users with an alternate secret cached', async () => {
    const userId = 5;

    const key = userFingerprintRedisKey;
    await redis.saddAsync(key, `${userId}`);

    const actual = await getFingerprint(userId);
    const expected = crypto
      .createHash('md5')
      .update(`${userId}:${clientId}:${alternateFingerprintSecret}`)
      .digest('hex');

    expect(actual).to.equal(expected);
  });

  it('allows forcing the alternate secret to be used', async () => {
    const userId = 6;

    const actual = await getFingerprint(userId, { forceAlternateSecret: true });
    const expected = crypto
      .createHash('md5')
      .update(`${userId}:${clientId}:${alternateFingerprintSecret}`)
      .digest('hex');

    expect(actual).to.equal(expected);
  });

  it('accepts a User instance instead of an id', async () => {
    const user = await factory.create<User>('user');

    const actual = await getFingerprint(user);
    const expected = crypto
      .createHash('md5')
      .update(`${user.id}:${clientId}:${userFingerprintSecret}`)
      .digest('hex');

    expect(actual).to.equal(expected);
  });

  it('handles legacy ids for User instances', async () => {
    const user = await factory.create<User>('user', { legacyId: 10 });

    const actual = await getFingerprint(user);
    const expected = crypto
      .createHash('md5')
      .update(`${user.legacyId}:${clientId}:${userFingerprintSecret}`)
      .digest('hex');

    expect(actual).to.equal(expected);
  });
});
