import * as sinon from 'sinon';
import { expect } from 'chai';
import { NonFunctionKeys } from 'utility-types';
import { snakeCase } from 'change-case';
import { DehydratedUser, DehydratedBaseDocument } from 'synapsepay';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import { SynapsepayDocumentLicenseStatus, SynapsepayDocumentSSNStatus } from '../../../src/typings';
import { SynapsepayDocument } from '../../../src/models';
import { refreshDocument, users } from '../../../src/domain/synapsepay';

const sandbox = sinon.createSandbox();

describe('refreshDocument', () => {
  before(() => clean());

  afterEach(() => clean(sandbox));

  const synapseUserPropertyTests: Array<{
    field: NonFunctionKeys<SynapsepayDocument>;
    original: any;
    updated: any;
  }> = [
    { field: 'permissionCode', original: null, updated: 'DUPLICATE_ACCOUNT' },
    { field: 'watchlists', original: 'PENDING', updated: 'MATCH' },
    { field: 'flag', original: 'NOT-FLAGGED', updated: 'FLAGGED' },
    { field: 'flagCode', original: 'NOT-FLAGGED', updated: 'ACCOUNT_CLOSURE|HIGH_RISK' },
    {
      field: 'extra',
      original: {
        cip_tag: 1,
        date_joined: 1498288029784,
        is_business: false,
        is_trusted: true,
        last_updated: 1498288034864,
        note: null,
        public_note: null,
        supp_id: '122eddfgbeafrfvbbb',
      },
      updated: {
        cip_tag: 1,
        date_joined: 1498288029784,
        is_business: false,
        is_trusted: true,
        last_updated: 1498288034864,
        note: 'Some new note is now here',
        public_note: 'Paras was here',
        supp_id: '122eddfgbeafrfvbbb',
      },
    },
  ];

  synapseUserPropertyTests.forEach(({ field, original, updated }) => {
    it(`handles updates to ${field}`, async () => {
      const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        synapsepayUserId: 'foo-bar',
        synapsepayDocId: 'baz-bop',
        [field]: original,
      });

      expect(dbDoc[field]).to.deep.equal(original, 'orginal value not set in db');

      const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
        id: dbDoc.synapsepayDocId,
      });

      const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
        _id: dbDoc.synapsepayUserId,
        [snakeCase(field)]: updated,
        documents: [baseDoc],
      });

      sandbox.stub(users, 'getAsync').resolves({
        json: dehydratedUser,
      });

      await refreshDocument(dbDoc);

      await dbDoc.reload();

      expect(dbDoc[field]).to.deep.equal(updated);
    });
  });

  const synapseDocumentPropertyTests: Array<{
    field: NonFunctionKeys<SynapsepayDocument>;
    original: any;
    updated: any;
  }> = [
    { field: 'addressCity', original: 'Beverly Hills', updated: 'Los Angeles' },
    { field: 'addressPostalCode', original: '90210', updated: '90019' },
    { field: 'addressStreet', original: '400 N Rodeo Dr,', updated: '1265 S Cochran St' },
    { field: 'addressSubdivision', original: 'TX', updated: 'CA' },
    { field: 'day', original: '4', updated: '5' },
    { field: 'email', original: 'david@gmail.com', updated: 'dave@dave.com' },
    { field: 'month', original: '4', updated: '5' },
    { field: 'phoneNumber', original: '+1234567890', updated: '+90918675309' },
    { field: 'name', original: 'Dave DaBear', updated: 'David Bearoff' },
    { field: 'year', original: '1980', updated: '2000' },
    { field: 'idScore', original: 0.3, updated: 0.6 },
  ];

  synapseDocumentPropertyTests.forEach(({ field, original, updated }) => {
    it(`handles updates to ${field}`, async () => {
      const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        synapsepayUserId: 'foo-bar',
        synapsepayDocId: 'baz-bop',
        [field]: original,
      });

      expect(dbDoc[field]).to.deep.equal(original, 'orginal value not set in db');

      const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
        id: dbDoc.synapsepayDocId,
        [snakeCase(field)]: updated,
      });

      const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
        _id: dbDoc.synapsepayUserId,
        documents: [baseDoc],
      });

      sandbox.stub(users, 'getAsync').resolves({
        json: dehydratedUser,
      });

      await refreshDocument(dbDoc);

      await dbDoc.reload();

      expect(dbDoc[field]).to.deep.equal(updated);
    });
  });

  it('handles updates to the licenseStatus', async () => {
    const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
      synapsepayUserId: 'foo-bar',
      synapsepayDocId: 'baz-bop',
      licenseStatus: SynapsepayDocumentLicenseStatus.Reviewing,
    });

    const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
      id: dbDoc.synapsepayDocId,
      physical_docs: [
        {
          document_type: 'GOVT_ID' as const,
          document_value:
            'https://cdn.synapsepay.com/uploads/2019/09/06/x05PvNUbO2VX98rTnJQzaAwiuF7KCgy41ljEeh6HYWkqZd3pRG.gif',
          id: '123',
          last_updated: 1498288034880,
          status: 'SUBMITTED|VALID' as const,
          meta: {
            matches: {
              address: 'not_found',
              dob: 'not_found',
              identification: 'not_found',
            },
            retry_count: 0,
          },
        },
      ],
    });

    const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
      _id: dbDoc.synapsepayUserId,
      documents: [baseDoc],
    });

    sandbox.stub(users, 'getAsync').resolves({
      json: dehydratedUser,
    });

    await refreshDocument(dbDoc);

    await dbDoc.reload();

    expect(dbDoc.licenseStatus).to.deep.equal('VALID');
  });

  it('handles updates to the ssnStatus', async () => {
    const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
      synapsepayUserId: 'foo-bar',
      synapsepayDocId: 'baz-bop',
      ssnStatus: SynapsepayDocumentSSNStatus.Valid,
    });

    const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
      id: dbDoc.synapsepayDocId,
      virtual_docs: [
        {
          document_type: 'SSN' as const,
          document_value: '2222',
          id: '123',
          last_updated: 1498288034880,
          status: 'SUBMITTED|INVALID|BLACKLIST' as const,
          meta: {
            matches: {
              address: 'not_found',
              dob: 'not_found',
              identification: 'not_found',
            },
            retry_count: 0,
          },
        },
      ],
    });

    const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
      _id: dbDoc.synapsepayUserId,
      documents: [baseDoc],
    });

    sandbox.stub(users, 'getAsync').resolves({
      json: dehydratedUser,
    });

    await refreshDocument(dbDoc);

    await dbDoc.reload();

    expect(dbDoc.ssnStatus).to.deep.equal('BLACKLIST');
  });

  [true, false].forEach(updatedVal => {
    const synapseValue = updatedVal ? 'MATCH' : 'NO_MATCH';

    it(`handles updates to the sanctionsScreeningMatch ${synapseValue}`, async () => {
      const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        synapsepayUserId: 'foo-bar',
        synapsepayDocId: 'baz-bop',
        sanctionsScreeningMatch: !updatedVal,
      });

      const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
        id: dbDoc.synapsepayDocId,
        screening_results: {
          561: 'NO_MATCH',
          aucl: synapseValue,
          dpl: 'NO_MATCH',
        },
      });

      const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
        _id: dbDoc.synapsepayUserId,
        documents: [baseDoc],
      });

      sandbox.stub(users, 'getAsync').resolves({
        json: dehydratedUser,
      });

      await refreshDocument(dbDoc);

      await dbDoc.reload();

      expect(dbDoc.sanctionsScreeningMatch).to.deep.equal(updatedVal);
    });
  });

  it('throws an error when there is not document with a matching id', async () => {
    const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
      synapsepayUserId: 'foo-bar',
      synapsepayDocId: 'baz-bop',
    });

    const baseDoc = await factory.create<DehydratedBaseDocument>('dehydrated-base-document', {
      id: 'some-other-id',
    });

    const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
      _id: dbDoc.synapsepayUserId,
      documents: [baseDoc],
    });

    sandbox.stub(users, 'getAsync').resolves({
      json: dehydratedUser,
    });

    let error;
    try {
      await refreshDocument(dbDoc);
    } catch (ex) {
      error = ex;
    }

    expect(error).to.exist;
    expect(error.message).to.equal('Could not find matching document');
    expect(error.data).to.deep.equal({
      documentId: 'baz-bop',
      availableIds: ['some-other-id'],
      synapsepayUserId: 'foo-bar',
    });
  });
});
