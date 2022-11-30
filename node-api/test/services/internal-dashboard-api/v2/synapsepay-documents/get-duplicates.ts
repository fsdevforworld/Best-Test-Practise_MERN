import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../factories';
import { clean, replayHttp, mockIpForSynapsepay, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import { SynapsepayDocument, User } from '../../../../../src/models';
import { synapsepaySerializers } from '../../serializers';

const fixtureDir = 'dashboard/v2/synapsepay-documents/get-duplicates';
const sandboxUsers = {
  openDupe: {
    synapsepayDocumentId: 1,
    synapsepayUserId: '5f617d24f8db930056f18ad3',
    userId: 1,
  },
  closedDupe: {
    synapsepayDocumentId: 2,
    synapsepayUserId: '5f617d2186770400569671e0',
    userId: 2,
  },
  unique: {
    synapsepayDocumentId: 3,
    synapsepayUserId: '5f628db004707a0055698c4d',
    userId: 3,
  },
};

describe('GET /v2/synapsepay-documents/:documentId/duplicates', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(sandbox));

  afterEach(() => clean(sandbox));

  it(
    'returns duplicate users, if any exist',
    replayHttp(`${fixtureDir}/duplicates.json`, async () => {
      const [openUser, closedUser] = await Promise.all([
        factory.create<User>('user', { id: sandboxUsers.openDupe.userId }),
        factory.create<User>('user', { id: sandboxUsers.closedDupe.userId }),
      ]);

      const [openDoc, closedDoc] = await Promise.all([
        factory.create<SynapsepayDocument>('synapsepay-document', {
          id: sandboxUsers.openDupe.synapsepayDocumentId,
          synapsepayUserId: sandboxUsers.openDupe.synapsepayUserId,
          userId: openUser.id,
        }),
        factory.create<SynapsepayDocument>('synapsepay-document', {
          id: sandboxUsers.closedDupe.synapsepayDocumentId,
          synapsepayUserId: sandboxUsers.closedDupe.synapsepayUserId,
          userId: closedUser.id,
        }),
      ]);

      // searching for the open doc's dupes
      let req = request(app)
        .get(`/v2/synapsepay-documents/${openDoc.id}/duplicates`)
        .expect(200);

      let {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      let [{ status, userId, synapsepayUserId }] = data.map(
        (duplicate: synapsepaySerializers.IDuplicateSynapsepayDocumentResource) =>
          duplicate.attributes,
      );
      expect(status).to.equal('CLOSED');
      expect(userId).to.equal(closedDoc.userId);
      expect(synapsepayUserId).to.equal(closedDoc.synapsepayUserId);

      // searching for the closed doc's dupes
      req = request(app)
        .get(`/v2/synapsepay-documents/${closedDoc.id}/duplicates`)
        .expect(200);

      ({
        body: { data },
      } = await withInternalUser(req));

      expect(data).to.have.length(1);

      [{ status, userId, synapsepayUserId }] = data.map(
        (duplicate: synapsepaySerializers.IDuplicateSynapsepayDocumentResource) =>
          duplicate.attributes,
      );
      expect(status).to.equal('OPEN');
      expect(userId).to.equal(openDoc.userId);
      expect(synapsepayUserId).to.equal(openDoc.synapsepayUserId);
    }),
  );

  it(
    `uses a null userId for any duplicate synapsepay user with no corresponding Dave user`,
    replayHttp(`${fixtureDir}/duplicates.json`, async () => {
      const openUser = await factory.create<User>('user', { id: sandboxUsers.openDupe.userId });

      const openDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        id: sandboxUsers.openDupe.synapsepayDocumentId,
        synapsepayUserId: sandboxUsers.openDupe.synapsepayUserId,
        userId: openUser.id,
      });

      const req = request(app)
        .get(`/v2/synapsepay-documents/${openDoc.id}/duplicates`)
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [{ status, userId, synapsepayUserId }] = data.map(
        (duplicate: synapsepaySerializers.IDuplicateSynapsepayDocumentResource) =>
          duplicate.attributes,
      );
      expect(status).to.equal('CLOSED');
      expect(userId).to.equal(null);
      expect(synapsepayUserId).to.equal(sandboxUsers.closedDupe.synapsepayUserId);
    }),
  );

  it(
    'returns an empty array if there are no duplicates',
    replayHttp(`${fixtureDir}/no-duplicates.json`, async () => {
      const uniqueUser = await factory.create<User>('user', { id: sandboxUsers.unique.userId });

      const uniqueDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        id: sandboxUsers.unique.synapsepayDocumentId,
        synapsepayUserId: sandboxUsers.unique.synapsepayUserId,
        userId: uniqueUser.id,
      });

      const req = request(app)
        .get(`/v2/synapsepay-documents/${uniqueDoc.id}/duplicates`)
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(0);
    }),
  );
});
