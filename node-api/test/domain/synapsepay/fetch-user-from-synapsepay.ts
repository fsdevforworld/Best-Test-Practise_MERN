import { expect } from 'chai';
import * as sinon from 'sinon';
import * as nock from 'nock';
import { User as SynapsepayUser, DehydratedUser } from 'synapsepay';
import { SynapsePayError } from '../../../src/lib/error';
import factory from '../../factories';
import { clean, replayHttp, mockIpForSynapsepay } from '../../test-helpers';
import { fetchUserFromSynapsepay } from '../../../src/domain/synapsepay';
import { isCached } from '../../../src/domain/synapsepay/alternate-fingerprint-cache';
import { User } from '../../../src/models';

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

const defaultSandbox = sinon.createSandbox();

describe('fetchUserFromSynapsepay', () => {
  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(defaultSandbox));

  afterEach(() => clean(defaultSandbox));

  function assertFetchedUserIsCorrect(
    synapsepayUser: SynapsepayUser<DehydratedUser>,
    synapsepayUserId: string,
  ) {
    expect(synapsepayUser.json._id).to.equal(synapsepayUserId);

    const subDoc = synapsepayUser.json.documents[0].social_docs[0];

    // Field is not present when user is not dehydrated
    expect(subDoc.document_value).to.exist;
  }

  it(
    `gets the dehydrated synapsepay user according to user.synapsepayId`,
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.standard.daveUserId,
        synapsepayId: sandboxUsers.standard.synapseUserId,
      });

      const synapsepayUser = await fetchUserFromSynapsepay(user);

      assertFetchedUserIsCorrect(synapsepayUser, user.synapsepayId);
    }),
  );

  it(
    `accepts the synapsepayUserId as an option`,
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.standard.daveUserId,
        synapsepayId: 'foo-bar',
      });

      const synapsepayUser = await fetchUserFromSynapsepay(user, {
        synapsepayUserId: sandboxUsers.standard.synapseUserId,
      });

      assertFetchedUserIsCorrect(synapsepayUser, sandboxUsers.standard.synapseUserId);
    }),
  );

  it(
    'handles users that have the alternate fingerprint',
    replayHttp(`${fixtureDir}/alternate-success.json`, async () => {
      const user = await factory.create<User>('user', {
        id: sandboxUsers.alternateFingerprint.daveUserId,
        synapsepayId: sandboxUsers.alternateFingerprint.synapsepayUserId,
      });

      const synapsepayUser = await fetchUserFromSynapsepay(user);
      assertFetchedUserIsCorrect(synapsepayUser, user.synapsepayId);

      const addedToCache = await isCached(user.id);
      expect(addedToCache).to.equal(true);
    }),
  );

  it('rejects with SynapsePayError on network errors', async () => {
    const synapseBaseApi = 'https://uat-api.synapsefi.com';
    nock(synapseBaseApi)
      .get(/users.+/)
      .replyWithError({ code: 'ETIMEDOUT' });

    const user = await factory.create<User>('user', {
      id: sandboxUsers.alternateFingerprint.daveUserId,
      synapsepayId: sandboxUsers.alternateFingerprint.synapsepayUserId,
    });

    try {
      await fetchUserFromSynapsepay(user);
      throw new Error();
    } catch (e) {
      expect(e).to.be.instanceOf(SynapsePayError);
      expect(e.statusCode).to.equal(502);
      expect(e.data.originalError.code).to.equal('ETIMEDOUT');
    }
  });
});
