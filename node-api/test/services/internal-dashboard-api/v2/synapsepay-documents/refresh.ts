import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../factories';
import { clean, replayHttp, mockIpForSynapsepay, withInternalUser } from '../../../../test-helpers';
import { SynapsepayDocument } from '../../../../../src/models';
import {
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
} from '../../../../../src/typings';
import app from '../../../../../src/services/internal-dashboard-api';

describe('POST /v2/synapsepay-documents/:id/refresh', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it(
    'successfully updates a document',
    replayHttp('/dashboard/v2/synapsepay-documents/refresh/success.json', async () => {
      mockIpForSynapsepay(sandbox);
      // Specific id needed for Synapse fingerprint
      const user = await factory.create('user', { id: 599 });

      const document = await factory.create<SynapsepayDocument>('synapsepay-document', {
        userId: user.id,
        synapsepayUserId: '5e28bc4ac256c30087cda60a',
        synapsepayDocId: 'df305287033fc9f0b045831452cae19238c128d3eccedb1d86294bd47e1267ea',
        phoneNumber: 'fake',
        email: 'fake',
        day: 'fake',
        month: 'fake',
        year: 'fake',
        addressStreet: 'fake',
        addressCity: 'fake',
        addressSubdivision: 'TX',
        addressPostalCode: 'fake',
        name: 'fake',
        ssnStatus: null,
        permission: SynapsepayDocumentPermission.Unverified,
        sanctionsScreeningMatch: true,
        watchlists: null,
        flag: null,
        extra: null,
      });

      const req = request(app)
        .post(`/v2/synapsepay-documents/${document.id}/refresh`)
        .expect(200);

      const {
        body: { data },
      } = await withInternalUser(req);

      await document.reload();

      expect(document.phoneNumber).to.equal('+11312103788');
      expect(document.email).to.equal('test@dave.com');
      expect(document.day).to.equal('1');
      expect(document.month).to.equal('1');
      expect(document.year).to.equal('1990');
      expect(document.addressStreet).to.equal('1269 S COCHRAN AVE');
      expect(document.addressCity).to.equal('LOS ANGELES');
      expect(document.addressSubdivision).to.equal('CA');
      expect(document.addressPostalCode).to.equal('90019');
      expect(document.name).to.equal('Test Person');
      expect(document.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Valid);
      expect(document.permission).to.equal(SynapsepayDocumentPermission.SendAndReceive);
      expect(document.sanctionsScreeningMatch).to.equal(false);
      expect(document.watchlists).to.equal('NO_MATCH');
      expect(document.flag).to.equal('NOT-FLAGGED');
      expect(document.extra).to.exist;

      expect(data.attributes.phoneNumber).to.equal('+11312103788');
      expect(data.attributes.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Valid);
      expect(data.attributes.permission).to.equal(SynapsepayDocumentPermission.SendAndReceive);
      expect(data.attributes.sanctionsScreeningMatch).to.equal(false);
      expect(data.attributes.watchlists).to.equal('NO_MATCH');
    }),
  );
});
