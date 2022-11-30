import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, replayHttp } from '../../test-helpers';
import { setupSynapsePayUser } from '../../domain/synapsepay/test-utils';
import { _patchSynapsePayUser } from '../../../src/domain/synapsepay';
import {
  extractUser,
  processSynapsepayUserUpdate,
} from '../../../src/consumers/synapsepay-update-user/process-user-update';
import { SynapsepayDocument, User } from '../../../src/models';
import { SynapsepayDocumentSSNStatus } from '../../../src/typings';
import { UserWebhookData } from 'synapsepay';
import { readFileSync } from 'fs';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import * as path from 'path';
import logger from '../../../src/lib/logger';

describe('processSynapsepayUserUpdate', () => {
  const sandbox = sinon.createSandbox();
  let consoleStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    consoleStub = sandbox.stub(logger, 'info');
  });

  afterEach(() => clean(sandbox));

  const baseWebhookData: UserWebhookData = JSON.parse(
    readFileSync(path.join(__dirname, 'user-webhook-data.json'), 'utf8'),
  );
  function tailorWebhookData(synapsepayId: string): UserWebhookData {
    const synapsepayIdObj = { $oid: synapsepayId };
    return { ...baseWebhookData, _id: synapsepayIdObj };
  }

  async function deleteUserAndDoc(user: User, doc: SynapsepayDocument): Promise<void> {
    await user.update({ synapsepayId: null });
    await Promise.all([user.destroy(), doc.destroy()]);
  }

  it(
    'should update user name, phone number, us territory address, email and birthdate in synapsepay_document table',
    replayHttp(
      'consumers/synapsepay-update-user/update-from-webhook-us-territories.json',
      async () => {
        const userId = 984;
        const phoneNumber = '+17778889999';
        const email = 'lana_kane@gmail.com';
        const user = await setupSynapsePayUser({ userId, phoneNumber, email });
        const newPhoneNumber = '+18643573130';
        const newEmail = 'newEmail@gmail.com';
        await user.update({ phoneNumber: newPhoneNumber });
        const userInfoUpdated = {
          firstName: 'Lana',
          lastName: 'Kane',
          addressLine1: '301 PR-26',
          city: 'San Juan',
          state: 'PR',
          zipCode: '00918',
          email: newEmail,
          birthdate: '1959-12-31',
        };
        await _patchSynapsePayUser(user, undefined, userInfoUpdated);

        const webhookData = tailorWebhookData(user.synapsepayId);
        await processSynapsepayUserUpdate(webhookData);
        const [doc] = await user.getSynapsepayDocuments();
        expect(doc.phoneNumber).to.equal(newPhoneNumber);
        expect(doc.addressStreet).to.equal(userInfoUpdated.addressLine1);
        expect(doc.addressCity).to.equal(userInfoUpdated.city);
        expect(doc.addressSubdivision).to.equal(userInfoUpdated.state);
        expect(doc.addressPostalCode).to.equal(userInfoUpdated.zipCode);
        expect(doc.email).to.equal(newEmail);
        expect(doc.name).to.equal('Lana Kane');
        expect(doc.year).to.equal('1959');
        expect(doc.month).to.equal('12');
        expect(doc.day).to.equal('31');
      },
    ),
  );

  it(
    'should update user name, phone number, address, email and birthdate in synapsepay_document table',
    replayHttp('consumers/synapsepay-update-user/update-from-webhook.json', async () => {
      const userId = 984;
      const phoneNumber = '+17778889999';
      const email = 'lana_kane@gmail.com';
      const user = await setupSynapsePayUser({ userId, phoneNumber, email });
      const newPhoneNumber = '+18643573130';
      const newEmail = 'newEmail@gmail.com';
      await user.update({ phoneNumber: newPhoneNumber });
      await _patchSynapsePayUser(user, undefined, {
        firstName: 'Lana',
        lastName: 'Kane',
        addressLine1: '1277 S COCHRAN AVE',
        city: 'LOS ANGELES',
        state: 'CA',
        zipCode: '90019',
        email: newEmail,
        birthdate: '1959-12-31',
      });
      const webhookData = tailorWebhookData(user.synapsepayId);
      await processSynapsepayUserUpdate(webhookData);
      const [doc] = await user.getSynapsepayDocuments();
      expect(doc.phoneNumber).to.equal(newPhoneNumber);
      expect(doc.addressStreet).to.equal('1277 S COCHRAN AVE');
      expect(doc.addressCity).to.equal('LOS ANGELES');
      expect(doc.addressSubdivision).to.equal('CA');
      expect(doc.addressPostalCode).to.equal('90019');
      expect(doc.email).to.equal(newEmail);
      expect(doc.name).to.equal('Lana Kane');
      expect(doc.year).to.equal('1959');
      expect(doc.month).to.equal('12');
      expect(doc.day).to.equal('31');
    }),
  );

  it(
    'should update deleted user',
    replayHttp('consumers/synapsepay-update-user/update-deleted-user.json', async () => {
      const userId = 648;
      const phoneNumber = '+17778889999';
      const user = await setupSynapsePayUser({ userId, phoneNumber });
      const [doc] = await user.getSynapsepayDocuments();
      const synapsepayUserId = user.synapsepayId;

      expect(doc.ssnStatus).to.be.null;
      await deleteUserAndDoc(user, doc);

      //simulate ssnUpdate and change in doc status
      const ssn = '11112222';
      user.synapsepayId = synapsepayUserId;
      await _patchSynapsePayUser(user, undefined, { ssn });
      const deletedDoc = await SynapsepayDocument.findByPk(doc.id, { paranoid: false });
      await deletedDoc.update({ ssnStatus: null });

      const webhookData = tailorWebhookData(synapsepayUserId);
      await processSynapsepayUserUpdate(webhookData);
      await deletedDoc.reload({ paranoid: false });
      expect(deletedDoc.ssnStatus).to.be.oneOf([
        SynapsepayDocumentSSNStatus.Valid,
        SynapsepayDocumentSSNStatus.Reviewing,
      ]);
    }),
  );

  it('should log when user not found instead of throwing an error', async () => {
    use(() => chaiAsPromised);
    const dataDogStub = sandbox.stub(dogstatsd, 'increment');
    await expect(processSynapsepayUserUpdate(baseWebhookData)).not.to.be.rejected;
    expect(consoleStub.calledOnce).to.be.true;
    expect(dataDogStub.calledOnce).to.be.true;
  });

  describe('extractUser', () => {
    it('should return active user given webhook data', async () => {
      const user = await factory.create('user');
      const webhookData = tailorWebhookData(user.synapsepayId);
      const extractedUser = await extractUser(webhookData);
      expect(extractedUser.synapsepayId).to.equal(user.synapsepayId);
      expect(extractedUser.id).to.equal(user.id);
    });

    it(
      'should return deleted user with synasepayId given webhook data',
      replayHttp('consumers/synapsepay-update-user/find-deleted-user.json', async () => {
        const user = await setupSynapsePayUser();
        const [doc] = await user.getSynapsepayDocuments();
        const synapsepayUserId = user.synapsepayId;
        await deleteUserAndDoc(user, doc);

        const webhookData = tailorWebhookData(synapsepayUserId);
        const extractedUser = await extractUser(webhookData);
        expect(extractedUser.synapsepayId).to.equal(synapsepayUserId);
        expect(extractedUser.id).to.equal(user.id);
      }),
    );

    it('should return null if no user found', async () => {
      const extractedUser = await extractUser(baseWebhookData);
      expect(extractedUser).to.be.null;
    });
  });
});
