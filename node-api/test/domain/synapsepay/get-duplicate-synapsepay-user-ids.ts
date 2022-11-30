import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, replayHttp, mockIpForSynapsepay } from '../../test-helpers';
import {
  _patchSynapsePayUser,
  getDuplicateSynapsepayUserIds,
} from '../../../src/domain/synapsepay';

import { setupSynapsePayUser } from './test-utils';
import { moment } from '@dave-inc/time-lib';

const fixtureDir = 'domain/synapsepay/get-duplicate-synapsepay-user-ids';

const sandbox = sinon.createSandbox();

describe('getDuplicateSynapsepayUserIds', () => {
  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(sandbox));

  afterEach(() => clean(sandbox));

  it(
    'should fetch all duplicate synapsepay user ids, organized by status',
    replayHttp(`${fixtureDir}/with-duplicates.json`, async () => {
      const dupeDetails = {
        firstName: 'Jamie',
        lastName: 'Madrox',
        birthdate: moment()
          .year(1990)
          .month('January')
          .date(1)
          .format('MM-DD-YYYY'),
      };

      const [closedDupe1, closedDupe2] = await Promise.all([
        setupSynapsePayUser({ userId: 2, phoneNumber: '+10105550000', ...dupeDetails }),
        setupSynapsePayUser({ userId: 3, phoneNumber: '+10205550000', ...dupeDetails }),
      ]);

      // we want this account to be the open one, so we have to ensure that it's created last as
      // synapse automatically closes existing users when a duplicate is created
      const openDupe = await setupSynapsePayUser({
        userId: 1,
        phoneNumber: '+10305550000',
        ...dupeDetails,
      });

      const [[openDoc], [closedDoc1], [closedDoc2]] = await Promise.all([
        openDupe.getSynapsepayDocuments(),
        closedDupe1.getSynapsepayDocuments(),
        closedDupe2.getSynapsepayDocuments(),
      ]);

      // searching for the open doc's dupes
      const openDupeDocs = await getDuplicateSynapsepayUserIds(openDoc);

      expect(openDupeDocs.openUserIds).to.have.length(0);

      expect(openDupeDocs.closedUserIds).to.have.length(2);
      expect(openDupeDocs.closedUserIds).to.include(closedDoc1.synapsepayUserId);
      expect(openDupeDocs.closedUserIds).to.include(closedDoc2.synapsepayUserId);

      expect(openDupeDocs.lockedUserIds).to.have.length(0);

      // searching for one of the closed doc's dupes
      const closed1DupeDocs = await getDuplicateSynapsepayUserIds(closedDoc1);

      expect(closed1DupeDocs.openUserIds).to.have.length(1);
      expect(closed1DupeDocs.openUserIds).to.include(openDoc.synapsepayUserId);

      expect(closed1DupeDocs.closedUserIds).to.have.length(1);
      expect(closed1DupeDocs.closedUserIds).to.include(closedDoc2.synapsepayUserId);

      expect(closed1DupeDocs.lockedUserIds).to.have.length(0);
    }),
  );

  it(
    'should return an empty closedUserIds array if there are no duplicates for an open account',
    replayHttp(`${fixtureDir}/without-duplicates.json`, async () => {
      const duplicateDetails = {
        firstName: 'Jaime',
        lastName: 'Lannister',
        birthdate: moment()
          .year(1935)
          .month('January')
          .date(1)
          .format('MM-DD-YYYY'),
      };

      const thereAreNoMenLikeMe = await setupSynapsePayUser({
        userId: 10,
        phoneNumber: '+19995550000',
        ...duplicateDetails,
      });

      const [document] = await thereAreNoMenLikeMe.getSynapsepayDocuments();

      const { openUserIds, closedUserIds, lockedUserIds } = await getDuplicateSynapsepayUserIds(
        document,
      );

      expect(openUserIds).to.have.length(0);
      expect(closedUserIds).to.have.length(0);
      expect(lockedUserIds).to.have.length(0);
    }),
  );
});
