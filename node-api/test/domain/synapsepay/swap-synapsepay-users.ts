import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, replayHttp, mockIpForSynapsepay } from '../../test-helpers';
import {
  _patchSynapsePayUser,
  swapSynapsepayUsers,
  refreshDocument,
} from '../../../src/domain/synapsepay';

import { setupSynapsePayUser, updateSynapsepayUser } from './test-utils';
import { moment } from '@dave-inc/time-lib';

const fixtureDir = 'domain/synapsepay/swap-synapsepay-users';

const sandbox = sinon.createSandbox();

describe('swapSynapsepayUsers', () => {
  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(sandbox));

  afterEach(() => clean(sandbox));

  const birthdate = moment('1960-10-01').format('YYYY-MM-DD');

  it(
    'should swap synapsepay users',
    replayHttp(`${fixtureDir}/success.json`, async () => {
      const user1 = await setupSynapsePayUser({
        userId: 3030,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103101',
        birthdate,
      });

      const user2 = await setupSynapsePayUser({
        userId: 3031,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103102',
        birthdate,
      });

      await updateSynapsepayUser(user2, {
        permission: 'CLOSED',
        permission_code: 'DUPLICATE_ACCOUNT',
        documents: [],
      });

      let [user2Doc] = await user2.getSynapsepayDocuments();
      expect(user2Doc.permission).to.equal('CLOSED');

      await swapSynapsepayUsers(user1.synapsepayId, user2.synapsepayId);

      const [user1Doc] = await user1.getSynapsepayDocuments();
      [user2Doc] = await user2.getSynapsepayDocuments();

      await refreshDocument(user1Doc);
      await refreshDocument(user2Doc);

      await user1Doc.reload();
      await user2Doc.reload();

      expect(user1Doc.permission).to.equal('CLOSED');
      expect(user2Doc.permission).to.not.equal('CLOSED');
    }),
  );

  it(
    'should fail when user account is locked',
    replayHttp(`${fixtureDir}/locked.json`, async () => {
      const user1 = await setupSynapsePayUser({
        userId: 3030,
        firstName: 'Jack',
        lastName: 'Sparrow',
        phoneNumber: '+13103103101',
        birthdate,
      });

      const user2 = await setupSynapsePayUser({
        userId: 3031,
        firstName: 'Will',
        lastName: 'Turner',
        phoneNumber: '+13103103102',
        birthdate,
      });

      await updateSynapsepayUser(user2, {
        permission: 'LOCKED',
        permission_code: 'USER_REQUEST',
        documents: [],
      });

      await expect(swapSynapsepayUsers(user1.synapsepayId, user2.synapsepayId)).to.be.rejected;
    }),
  );

  it(
    'should fail if both users are unverified',
    replayHttp(`${fixtureDir}/both-unverified.json`, async () => {
      const user1 = await setupSynapsePayUser({
        userId: 3030,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103101',
        birthdate,
      });

      const user2 = await setupSynapsePayUser({
        userId: 3031,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103102',
        birthdate,
      });

      await expect(swapSynapsepayUsers(user1.synapsepayId, user2.synapsepayId)).to.be.rejected;
    }),
  );
});
