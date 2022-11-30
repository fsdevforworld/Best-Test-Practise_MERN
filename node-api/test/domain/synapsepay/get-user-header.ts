import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, replayHttp, mockIpForSynapsepay } from '../../test-helpers';
import { getUserHeader } from '../../../src/domain/synapsepay';
import { User } from '../../../src/models';

// using same fixtures as fetchUserFromSynapsepay tests, as all these tests care about is formatting
// of the header
const fixtureDir = 'domain/synapsepay/fetch-user-from-synapsepay';
const sandboxUsers = {
  standard: {
    synapseUserId: '5e6800a15b5a1e007de0d34a',
    daveUserId: 4000,
  },
  alternateFingerprint: {
    synapsepayUserId: '5ea8a9b6488400007b0c913f',
    daveUserId: 456,
  },
};
const headerKey = 'X-SP-USER';

const defaultSandbox = sinon.createSandbox();

describe('getUserHeader', () => {
  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(defaultSandbox));

  afterEach(() => clean(defaultSandbox));

  it(
    'returns an `oauth|fingerprint` header value by default',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.standard.daveUserId,
        synapsepayId: sandboxUsers.standard.synapseUserId,
      });

      const { [headerKey]: value } = await getUserHeader(user);

      expect(value).to.match(/^[A-z0-9]+\|[A-z0-9]+$/);
    }),
  );

  it(
    'can also accept a synapsepayUserId option',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.standard.daveUserId,
        synapsepayId: sandboxUsers.standard.synapseUserId,
      });

      const { [headerKey]: value } = await getUserHeader(user, {
        synapsepayUserId: user.synapsepayId,
      });

      expect(value).to.match(/^[A-z0-9]+\|[A-z0-9]+$/);
    }),
  );

  it(
    'returns an `|fingerprint` header value if includeOAuthKey is set to false',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.standard.daveUserId,
        synapsepayId: sandboxUsers.standard.synapseUserId,
      });

      const { [headerKey]: value } = await getUserHeader(user, { includeOauthKey: false });

      expect(value).to.match(/^\|[A-z0-9]+$/);
    }),
  );
});
