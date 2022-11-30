/* tslint:disable: no-require-imports */
/* tslint:disable: no-var-requires */
import * as sinon from 'sinon';
import {
  addUserToFingerprintCache,
  checkFingerprintCache,
  fetchSynapsePayUser,
  diffSynapsePayUser,
  upsertSynapsePayUser,
} from '../../../src/domain/synapsepay/user';
import { expect } from 'chai';
import factory from '../../factories';
import * as Faker from 'faker';
import { clean, replayHttp } from '../../test-helpers';
import {
  BasicSubDocument,
  SynapsePayUserUpdateFields,
  DehydratedUser,
  DehydratedBaseDocument,
} from 'synapsepay';
import { ThirdPartyName, User } from '../../../src/models';
import { SynapsepayDocumentLicenseStatus, SynapsepayDocumentSSNStatus } from '../../../src/typings';
import * as SynapsePayDocumentHelper from '../../../src/domain/synapsepay/document';
import { users as SynapseUser } from '../../../src/domain/synapsepay/external-model-definitions';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { createUserWithNewFingerprint, generateLicense, setupSynapsePayUser } from './test-utils';
import { DocumentType } from '../../../src/domain/synapsepay';
import { mungeSynapsePayUserPayload } from '../../../src/domain/synapsepay/core';

// not sure why but if I do import with multer, I don't meet the type requirement of upsertSynapsePayUser
const multer = require('multer');

describe('SynapsePay User', () => {
  const sandbox = sinon.createSandbox();
  const ip = '192.168.0.124';

  before(() => clean());

  beforeEach(() => sandbox.stub(dogstatsd, 'increment'));

  afterEach(() => clean(sandbox));

  describe('upsertSynapsePayUser', () => {
    let fields: SynapsePayUserUpdateFields;
    const customError = {
      response: {
        body: {
          error: 'Some error',
        },
      },
    };

    before(() => {
      fields = {
        firstName: Faker.name.firstName(),
        lastName: Faker.name.lastName(),
        email: Faker.internet.email(),
        addressLine1: Faker.address.streetAddress(),
        city: Faker.address.city(),
        state: Faker.address.state(),
        zipCode: Faker.address.zipCode(),
        countryCode: Faker.address.countryCode(),
        birthdate: Faker.date.past().toString(),
        ssn: `${Faker.random.number()}`,
        license: multer().buffer,
      };
    });

    it('should throw an error when creating synapse document', async () => {
      const user = await factory.create('user');
      const loggedFields = { ...fields };
      delete loggedFields.ssn;
      delete loggedFields.license;
      sandbox
        .stub(SynapsePayDocumentHelper, '_createSynapsePayDocumentForUser')
        .throws(customError);

      try {
        await upsertSynapsePayUser(user, ip, fields);
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.data.fields).to.deep.equal(loggedFields);
        expect(error.data.synapseUpsertEvent).to.equal('Create SynapsePay document for user');
      }
    });

    it('should log errors when creating synapse user fails', async () => {
      const user = await factory.create('user', { synapsepayId: null });
      delete fields.firstName;
      delete fields.lastName;
      const loggedFields = { ...fields };
      delete loggedFields.ssn;
      delete loggedFields.license;
      sandbox.stub(ThirdPartyName, 'findOne').throws(customError);

      try {
        await upsertSynapsePayUser(user, ip, fields);
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.data.fields).to.deep.equal(loggedFields);
        expect(error.data.synapseUpsertEvent).to.equal('Create SynapsePay user');
      }
    });

    it(
      'should create synapse user with the proper information',
      replayHttp('domain/synapsepay/user/create-user.json', async () => {
        const userFields = {
          firstName: 'Michelle',
          lastName: 'Obama',
          addressLine1: '1600 Pennsylvania Avenue NW',
          city: 'Washington',
          state: 'DC',
          zipCode: '20500',
          ssn: '111112222',
        };
        const user = await factory.create('user', {
          id: 8374,
          synapsepayId: null,
          phoneNumber: '+12021112222',
          ...userFields,
        });
        const createUserAsyncSpy = sandbox.spy(SynapseUser, 'createAsync');
        await upsertSynapsePayUser(user, ip, userFields);

        const returnData = (await createUserAsyncSpy.returnValues[0]).json;
        const virtualDoc = returnData.documents[0].virtual_docs[0];

        expect(returnData.legal_names).to.be.deep.eq(['Michelle Obama']);
        expect(returnData.phone_numbers).to.be.deep.eq(['+12021112222']);

        expect(virtualDoc.document_type).to.be.eq(DocumentType.SSN);
        expect(virtualDoc.status).to.be.eq('SUBMITTED|REVIEWING');
      }),
    );

    it('should throw an error when updating synapse user', async () => {
      const user = await factory.create('user');
      await factory.create('synapsepay-document', { userId: user.id });
      const loggedFields = { ...fields };
      delete loggedFields.ssn;
      delete loggedFields.license;
      sandbox.stub(SynapseUser, 'getAsync').throws(customError);

      try {
        await upsertSynapsePayUser(user, ip, fields);
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.data.fields).to.deep.equal(loggedFields);
        expect(error.data.synapseUpsertEvent).to.equal('Update SynapsePay user');
      }
    });

    it(
      'should update ssn status in Synapsepay and db synapsepay document given valid ssn',
      replayHttp('domain/synapsepay/user/update-ssn.json', async () => {
        const userIdFromFixture = 567;
        const user = await setupSynapsePayUser({ userId: userIdFromFixture });
        const ssn = '111112222';
        await user.update({ ssn });
        await upsertSynapsePayUser(user, undefined, { ssn });
        const [doc] = await user.getSynapsepayDocuments();

        const validStatuses = [
          SynapsepayDocumentSSNStatus.Valid,
          SynapsepayDocumentSSNStatus.Reviewing,
        ];
        expect(doc.ssnStatus).to.be.oneOf(validStatuses);
        const externalDoc = await fetchSynapsePayUser(user, { ip });
        const ssnDocType = DocumentType.SSN;
        const externalDocSsn = externalDoc.json.documents[0].virtual_docs.find(
          (d: BasicSubDocument) => d.document_type === ssnDocType,
        );
        expect(externalDocSsn.document_value).to.equal(ssn);
        const ssnStatus = SynapsePayDocumentHelper.default._extractSynapsePayDocumentStatus(
          ssnDocType,
          externalDoc.json,
        );
        expect(ssnStatus).to.be.oneOf(validStatuses);
      }),
    );

    it(
      'should update license status in in Synapsepay and db synasepapy document given valid license',
      replayHttp('domain/synapsepay/user/update-license.json', async () => {
        const userIdFromFixture = 938;
        const user = await setupSynapsePayUser({ userId: userIdFromFixture });

        // simulate license update
        const license = generateLicense();
        await upsertSynapsePayUser(user, undefined, { license });
        const [doc] = await user.getSynapsepayDocuments();
        const validStatuses = [
          SynapsepayDocumentLicenseStatus.Valid,
          SynapsepayDocumentLicenseStatus.Reviewing,
        ];
        expect(doc.licenseStatus).to.be.oneOf(validStatuses);

        const externalDoc = await fetchSynapsePayUser(user, { ip });
        const licenseDocType = DocumentType.GOVT_ID;
        const licenseStatus = SynapsePayDocumentHelper.default._extractSynapsePayDocumentStatus(
          licenseDocType,
          externalDoc.json,
        );
        expect(licenseStatus).to.be.oneOf(validStatuses);
      }),
    );

    context('updating kyc', async () => {
      it(
        'should update phone number',
        replayHttp('domain/synapsepay/user/update-phone-number.json', async () => {
          const oldPhoneNumber = '+12813925411';
          const userIdFromFixture = 330;
          const user = await setupSynapsePayUser({
            userId: userIdFromFixture,
            phoneNumber: oldPhoneNumber,
          });

          // simulate phone update
          const newPhoneNumber = '+17134506200';
          await user.update({ phoneNumber: newPhoneNumber });
          await upsertSynapsePayUser(user, ip);

          const [savedDoc] = await user.getSynapsepayDocuments();

          expect(savedDoc.phoneNumber).to.equal(newPhoneNumber, 'Synapse Document saved to db');

          const externalDoc = await fetchSynapsePayUser(user, { ip });

          expect(externalDoc.json.documents[0].phone_number).to.equal(
            newPhoneNumber,
            'Document pulled from Synapsepay',
          );
        }),
      );

      it(
        'should update addresses with addressLine1',
        replayHttp('domain/synapsepay/user/update-address.json', async () => {
          const user = await setupSynapsePayUser({
            userId: 543,
            address: {
              addressLine1: '1265 S Cochran Ave',
              city: 'Los Angeles',
              state: 'CA',
              zipCode: '90019',
            },
          });
          const update: SynapsePayUserUpdateFields = {
            addressLine1: '1 MARKET ST',
            city: 'SAN FRANCISCO',
            state: 'CA',
            zipCode: '94105',
            countryCode: 'US',
          };
          await upsertSynapsePayUser(user, undefined, update);
          const [savedDoc] = await user.getSynapsepayDocuments();
          const externalDoc = await fetchSynapsePayUser(user, { ip });
          const addressSubDocument = externalDoc.json.documents[0].social_docs.find(
            doc => doc.document_type === 'ADDRESS',
          );
          expect(savedDoc.addressStreet).to.equal(update.addressLine1);
          expect(savedDoc.addressCity).to.equal(update.city);
          expect(savedDoc.addressSubdivision).to.equal(update.state);
          expect(savedDoc.addressPostalCode).to.equal(update.zipCode);

          expect(externalDoc.json.documents[0].address_street).to.equal(savedDoc.addressStreet);
          expect(externalDoc.json.documents[0].address_city).to.equal(savedDoc.addressCity);
          expect(externalDoc.json.documents[0].address_subdivision).to.equal(
            savedDoc.addressSubdivision,
          );
          expect(externalDoc.json.documents[0].address_postal_code).to.equal(update.zipCode);

          expect(addressSubDocument.document_value).to.equal(
            '1 MARKET ST, SAN FRANCISCO, CA, US, 94105.',
          );
        }),
      );

      it(
        'should update addresses with addressLine1 and addressLine2',
        replayHttp('domain/synapsepay/user/update-address-with-line2.json', async () => {
          const user = await setupSynapsePayUser({
            userId: 543,
            address: {
              addressLine1: '1265 S Cochran Ave',
              city: 'Los Angeles',
              state: 'CA',
              zipCode: '90019',
            },
          });
          const update: SynapsePayUserUpdateFields = {
            addressLine1: '10500 Lake June Rd',
            addressLine2: 'Unit N3',
            city: 'DALLAS',
            state: 'TX',
            zipCode: '75217',
            countryCode: 'US',
          };
          await upsertSynapsePayUser(user, undefined, update);
          const [savedDoc] = await user.getSynapsepayDocuments();
          const externalDoc = await fetchSynapsePayUser(user, { ip });
          const addressSubDoc = externalDoc.json.documents[0].social_docs.find(
            doc => doc.document_type === 'ADDRESS',
          );
          expect(savedDoc.addressStreet).to.equal('10500 Lake June Rd Unit N3');
          expect(savedDoc.addressCity).to.equal(update.city);
          expect(savedDoc.addressSubdivision).to.equal(update.state);
          expect(savedDoc.addressPostalCode).to.equal(update.zipCode);

          expect(externalDoc.json.documents[0].address_street).to.equal(
            '10500 LAKE JUNE RD APT N3',
          );
          expect(externalDoc.json.documents[0].address_city).to.equal(savedDoc.addressCity);
          expect(externalDoc.json.documents[0].address_subdivision).to.equal(
            savedDoc.addressSubdivision,
          );
          expect(externalDoc.json.documents[0].address_postal_code).to.equal(update.zipCode);

          expect(addressSubDoc.document_value).to.equal(
            '10500 Lake June Rd Unit N3, DALLAS, TX, US, 75217.',
          );
        }),
      );

      it(
        'should update email',
        replayHttp('domain/synapsepay/user/update-email.json', async () => {
          const user = await setupSynapsePayUser({
            userId: 8624,
            email: 'louise_if_you_please@yahoo.com',
          });
          const newEmail = 'thunderkat4387@hotmail.com';
          const update: SynapsePayUserUpdateFields = {
            email: newEmail,
          };
          await upsertSynapsePayUser(user, ip, update);
          const [savedDoc] = await user.getSynapsepayDocuments();
          const externalDoc = await fetchSynapsePayUser(user, { ip });
          const emailSubDoc = externalDoc.json.documents[0].social_docs.find(
            doc => doc.document_type === 'EMAIL',
          );
          expect(savedDoc.email).to.equal(newEmail);
          expect(externalDoc.json.documents[0].email).to.equal(newEmail);
          expect(emailSubDoc.document_value).to.equal(newEmail);
        }),
      );

      it(
        'should update name',
        replayHttp('domain/synapsepay/user/update-name.json', async () => {
          const user = await setupSynapsePayUser({ userId: 4564 });
          const update: SynapsePayUserUpdateFields = {
            firstName: 'Louise',
            lastName: 'JustGotMarriedNewLastName',
          };
          await upsertSynapsePayUser(user, ip, update);
          const [savedDoc] = await user.getSynapsepayDocuments();
          const externalDoc = await fetchSynapsePayUser(user, { ip });
          expect(savedDoc.name).to.equal('Louise JustGotMarriedNewLastName');
          expect(externalDoc.json.documents[0].name).to.equal('Louise JustGotMarriedNewLastName');
        }),
      );

      it(
        'should update birthdate',
        replayHttp('domain/synapsepay/user/update-datebirth.json', async () => {
          const user = await setupSynapsePayUser({ userId: 4564, birthdate: '1959-12-30' });
          const update: SynapsePayUserUpdateFields = {
            birthdate: '1959-12-31',
          };
          await upsertSynapsePayUser(user, ip, update);
          const [savedDoc] = await user.getSynapsepayDocuments();
          const externalDoc = await fetchSynapsePayUser(user, { ip });
          const dateSubDoc = externalDoc.json.documents[0].social_docs.find(
            doc => doc.document_type === 'DATE',
          );
          expect(savedDoc.day).to.equal('31');
          expect(savedDoc.month).to.equal('12');
          expect(savedDoc.year).to.equal('1959');
          expect(externalDoc.json.documents[0].day).to.equal(31);
          expect(externalDoc.json.documents[0].month).to.equal(12);
          expect(externalDoc.json.documents[0].year).to.equal(1959);
          expect(dateSubDoc.document_value).to.equal('12/31/1959');
        }),
      );
    });
  });

  describe('fetchSynapsePayUser', () => {
    it(
      'gets SynapsePay user using new fingerprint and caches the user id',
      replayHttp('domain/synapsepay/user/get-user-new-fingerprint.json', async () => {
        const user = await createUserWithNewFingerprint();
        const spy = sandbox.spy(SynapseUser, 'getAsync');
        const userFromSynapsePay = await fetchSynapsePayUser(user);
        const includesUserId = await checkFingerprintCache(user.id.toString());
        expect(userFromSynapsePay.json._id).to.equal(user.synapsepayId);
        expect(Boolean(includesUserId)).to.be.true;
        expect(spy.callCount).to.equal(2);
      }),
    );

    it(
      'checks the cache first to see if user takes new fingerprint before getting user with current fingerprint',
      replayHttp('domain/synapsepay/user/get-user-fingerprint-cache.json', async () => {
        const user = await createUserWithNewFingerprint();
        await addUserToFingerprintCache(user.id);
        const spy = sandbox.spy(SynapseUser, 'getAsync');
        const userFromSynapsePay = await fetchSynapsePayUser(user);
        expect(userFromSynapsePay.json._id).to.equal(user.synapsepayId);
        expect(spy.callCount).to.equal(1);
      }),
    );
  });

  describe('diffSynapsePayUser', () => {
    it('should not overwrite current document values with undefined from updated document', async () => {
      const updateFields = {
        email: 'disMyNewEmail@dave.com',
        id: 'doc_id',
        ip: 'some_ip',
        entity_scope: 'some_scope',
        entity_type: 'some_type',
      };

      const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document');
      const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
        documents: [doc],
      });

      const updateDoc = { documents: [updateFields] };
      const payload = diffSynapsePayUser(user, updateDoc);

      expect(payload).to.deep.equal({
        documents: [
          {
            email: updateFields.email,
            id: doc.id,
          },
        ],
      });
    });

    it('should send birthdate together', async () => {
      const updateFields = {
        year: 2019,
        month: 9,
        day: 9,
      };

      const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document');
      const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
        documents: [doc],
      });

      const updateDoc = { documents: [updateFields] };
      const payload = diffSynapsePayUser(user, updateDoc);

      expect(payload).to.deep.equal({
        documents: [
          {
            year: 2019,
            month: 9,
            day: 9,
            id: doc.id,
          },
        ],
      });
    });

    it('should not add fields with different string casing to the update payload', async () => {
      const differentlyCasedFields = {
        name: 'Dave Dave',
        email: 'TEST@dave.com',
        year: 0,
        month: 0,
        day: 0,
      };

      const updateFields = {
        name: 'dave dave',
        email: 'test@dave.com',
        year: 2019,
        month: 9,
        day: 8,
      };

      const doc = await factory.build<DehydratedBaseDocument>(
        'dehydrated-base-document',
        differentlyCasedFields,
      );
      const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
        documents: [doc],
      });

      const updateDoc = { documents: [updateFields] };
      const payload = diffSynapsePayUser(user, updateDoc);

      expect(payload.documents[0]).to.eql({
        id: doc.id,
        day: 8,
        month: 9,
        year: 2019,
      });
    });

    context('address updates', () => {
      it('should always include country code', async () => {
        const updateFields = {
          address_street: '20 COOPER SQ',
          address_city: 'NEW YORK',
          address_subdivision: 'NY',
          address_country_code: 'US',
          address_postal_code: '10003',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document');
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: '20 COOPER SQ',
          address_city: 'NEW YORK',
          address_subdivision: 'NY',
          address_postal_code: '10003',
          address_country_code: 'US',
        });
      });

      it('should always include country code for US territories', async () => {
        const updateFields = {
          address_street: '301 PR-26',
          address_city: 'San Juan',
          address_subdivision: 'PR',
          address_country_code: 'PR',
          address_postal_code: '00918',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document');
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: '301 PR-26',
          address_city: 'San Juan',
          address_subdivision: 'PR',
          address_postal_code: '00918',
          address_country_code: 'PR',
        });
      });

      it('should accept address changes from US territories to US state', async () => {
        const updateFields = {
          address_street: '1265 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90019',
          address_country_code: 'US',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
          address_street: '301 PR-26',
          address_city: 'San Juan',
          address_subdivision: 'PR',
          address_country_code: 'PR',
          address_postal_code: '00918',
        });
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: updateFields.address_street,
          address_city: updateFields.address_city,
          address_postal_code: updateFields.address_postal_code,
          address_country_code: updateFields.address_country_code,
          address_subdivision: updateFields.address_subdivision,
        });
      });

      it('should accept address changes from US state to US territories', async () => {
        const updateFields = {
          address_street: '301 PR-26',
          address_city: 'San Juan',
          address_subdivision: 'PR',
          address_country_code: 'PR',
          address_postal_code: '00918',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
          address_street: '1265 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90019',
          address_country_code: 'US',
        });
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: updateFields.address_street,
          address_city: updateFields.address_city,
          address_postal_code: updateFields.address_postal_code,
          address_country_code: updateFields.address_country_code,
          address_subdivision: updateFields.address_subdivision,
        });
      });

      it('should send complete address given address street changes only', async () => {
        const updateFields = {
          address_street: '1277 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90019',
          address_country_code: 'US',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
          ...updateFields,
          address_street: '123 Main St',
        });
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: '1277 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_postal_code: '90019',
          address_country_code: 'US',
          address_subdivision: 'CA',
        });
      });

      it('should send complete address given city and state are the same', async () => {
        const updateFields = {
          address_street: '123 SOMEWHERE IN LA ST',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90000',
          address_country_code: 'US',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
          address_street: '1265 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90019',
          address_country_code: 'US',
        });
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: '123 SOMEWHERE IN LA ST',
          address_city: 'LOS ANGELES',
          address_postal_code: '90000',
          address_country_code: 'US',
          address_subdivision: 'CA',
        });
      });

      it('should send complete address given state is the same', async () => {
        const updateFields = {
          address_street: '123 SOMEWHERE IN SB ST',
          address_city: 'SANTA BARBARA',
          address_subdivision: 'CA',
          address_postal_code: '93103',
          address_country_code: 'US',
        };

        const doc = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
          address_street: '1265 S COCHRAN AVE',
          address_city: 'LOS ANGELES',
          address_subdivision: 'CA',
          address_postal_code: '90019',
          address_country_code: 'US',
        });
        const user = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
          documents: [doc],
        });

        const updateDoc = { documents: [updateFields] };
        const payload = diffSynapsePayUser(user, updateDoc);

        expect(payload.documents[0]).to.eql({
          id: doc.id,
          address_street: '123 SOMEWHERE IN SB ST',
          address_city: 'SANTA BARBARA',
          address_postal_code: '93103',
          address_country_code: 'US',
          address_subdivision: 'CA',
        });
      });
    });
  });

  describe('mungeSynapsePayUserPayload', () => {
    const phoneNumber = '+19998887777';
    const email = 'myNewEmail@email.com';
    const firstName = 'Slim';
    const lastName = 'Shady';

    it('should set email to fields.email when provided', async () => {
      const user = await factory.create<User>('user', {
        email: 'myOldEmail@gmail.com',
        phoneNumber,
      });
      const fields = { firstName, lastName, email };
      const payload = mungeSynapsePayUserPayload(ip, user, fields);
      expect(payload.logins[0].email).to.equal(email);
      expect(payload.documents[0].email).to.equal(email);
    });

    it('should set email to user.email when not provided as a field', async () => {
      const user = await factory.create<User>('user', {
        email,
        phoneNumber,
      });
      const fields = { firstName, lastName };
      const payload = mungeSynapsePayUserPayload(ip, user, fields);
      expect(payload.logins[0].email).to.equal(email);
      expect(payload.documents[0].email).to.equal(email);
    });

    //TODO: Clean up CE-1195
    it('should remove whitespaces from email', async () => {
      const user = await factory.create<User>('user', { phoneNumber });
      const fields = { firstName, lastName, email: ` ${email} ` };
      const payload = mungeSynapsePayUserPayload(ip, user, fields);
      expect(payload.logins[0].email).to.equal(email);
      expect(payload.documents[0].email).to.equal(email);
    });

    it('should set email as phoneNumber if there is no fields.email or user.email', async () => {
      const user = await factory.create<User>('user', {
        phoneNumber,
      });
      const fields = { firstName, lastName };
      const payload = mungeSynapsePayUserPayload(ip, user, fields);
      expect(payload.logins[0].email).to.equal(phoneNumber);
      expect(payload.documents[0].email).to.equal(phoneNumber);
    });
  });
});
