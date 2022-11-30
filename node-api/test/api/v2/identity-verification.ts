import * as request from 'supertest';
import * as Bluebird from 'bluebird';
import * as sinon from 'sinon';
import factory from '../../factories';
import app from '../../../src/api';
import { BasicSubDocument } from 'synapsepay';
import { userUpdatedEvent } from '../../../src/domain/event';
import { setupSynapsePayUser } from '../../domain/synapsepay/test-utils';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import * as UserUpdatesDomain from '../../../src/domain/user-updates';
import * as SynapsePay from '../../../src/domain/synapsepay';
import * as Jobs from '../../../src/jobs/data';
import * as EmailVerificationHelper from '../../../src/helper/email-verification';
import * as identityApi from '../../../src/domain/identity-api';
import { moment } from '@dave-inc/time-lib';
import gcloudKms from '../../../src/lib/gcloud-kms';
import { AuditLog, EmailVerification, User } from '../../../src/models';
import {
  AnalyticsEvent,
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
} from '../../../src/typings';

import { expect } from 'chai';
import * as verifiedSuccessSynapseUser from '../../fixtures/synapse-pay/GET-verified-success-user.json';
import { clean, replayHttp, up } from '../../test-helpers';

describe('/v2/identity_verification/*', () => {
  const sandbox = sinon.createSandbox();
  const ip = '192.168.0.124';

  const successEmail = 'mick@rollingstone.biz';

  const successPayload = {
    firstName: 'Mick',
    lastName: 'jagger',
    email: successEmail,
    addressLine1: '1269 S Cochran Ave',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
    birthdate: '1980-01-01',
    ssn: '123456789',
  };

  // clean everything before we start
  before(() => clean());

  beforeEach(() => {
    sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(true);
    sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
  });

  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  describe('GET /v2/identity_verification', () => {
    function createSynapseStub(
      permission: SynapsepayDocumentPermission,
      ssnStatus: SynapsepayDocumentSSNStatus,
    ): { json: { [key: string]: any }; updateAsync: () => { [key: string]: any } } {
      return {
        json: { documents: [{ physical_docs: [] }] },
        updateAsync: () => {
          return {
            json: {
              permission,
              documents: [
                { virtual_docs: [{ document_type: 'SSN', status: `SUBMITTED|${ssnStatus}` }] },
              ],
            },
          };
        },
      };
    }
    context('tests that require fixtures', () => {
      beforeEach(() => up());

      it('should return an approved status', async () => {
        const synapseStub = createSynapseStub(
          SynapsepayDocumentPermission.SendAndReceive,
          SynapsepayDocumentSSNStatus.Valid,
        );
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves(synapseStub);
        const result = await request(app)
          .get('/v2/identity_verification')
          .set('Authorization', 'token-900')
          .set('X-Device-Id', 'id-900');

        expect(result.status).to.equal(200);
        expect(result.body.approved).to.equal(true);
      });

      it('should return a failure status', async () => {
        const synapseStub = createSynapseStub(
          SynapsepayDocumentPermission.Unverified,
          SynapsepayDocumentSSNStatus.Invalid,
        );
        sandbox.stub(SynapsepayModels.users, 'getAsync').resolves(synapseStub);
        const result = await request(app)
          .get('/v2/identity_verification')
          .set('Authorization', 'token-901')
          .set('X-Device-Id', 'id-901');

        expect(result.status).to.equal(200);
        expect(result.body.approved).to.equal(false);
        expect(result.body.status).to.equal('UPLOAD_LICENSE');
      });
    });
  });

  describe('POST /v2/identity_verification', () => {
    let auditLogStub: sinon.SinonStub;
    let updateBrazeJobStub: sinon.SinonStub;
    let updateSynapsepayUserJob: sinon.SinonStub;
    let userUpdatedEventStub: sinon.SinonStub;

    beforeEach(() => {
      auditLogStub = sandbox.stub(AuditLog, 'create');
      updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      updateSynapsepayUserJob = sandbox.stub(Jobs, 'updateSynapsepayUserTask');
      userUpdatedEventStub = sandbox.stub(userUpdatedEvent, 'publish');
      return up();
    });

    it('should fail if any required params are not provided', async () => {
      const result = await request(app)
        .post('/v2/identity_verification')
        .set('Authorization', 'token-900')
        .set('X-Device-Id', 'id-900')
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters/);
    });

    it(
      'should succeed + return a success status for a user with some identity info',
      replayHttp('domain/synapsepay/user/bulk-update-user-info.json', async () => {
        const userId = 584;
        const user = await setupSynapsePayUser({ userId });
        const upsertSynapsePayUserSpy = sandbox.spy(SynapsePay, 'upsertSynapsePayUser');
        const updateUserAsyncSpy = sandbox.spy(SynapsepayModels.user.prototype, 'updateAsync');

        const result = await request(app)
          .post('/v2/identity_verification')
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .set('X-Forwarded-For', ip)
          .send(successPayload);

        const ssnDoc = updateUserAsyncSpy.returnValues[0]._rejectionHandler0.json.documents[0].virtual_docs.find(
          (d: BasicSubDocument) => d.document_type === SynapsePay.DocumentType.SSN,
        );

        expect(ssnDoc.status).to.equal('SUBMITTED|REVIEWING');
        expect(result.status).to.equal(200);
        await user.reload();

        const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserSpy.args;
        expect(userParam.synapsepayId).to.equal(user.synapsepayId);
        expect(ipParam).to.equal(ip);
        expect(fieldParam).to.deep.equal({
          ...successPayload,
          addressLine2: undefined,
        });
        const { birthdate, city, firstName, lastName } = successPayload;
        sinon.assert.calledWithMatch(updateBrazeJobStub.firstCall, {
          userId: 584,
          attributes: { email_verified: false },
          eventProperties: {
            name: AnalyticsEvent.EmailUnverified,
            properties: {
              unverifiedEmail: 'mick@rollingstone.biz',
              obfuscatedEmail: 'm****k@rollingstone.biz',
              url: sinon.match.string,
              sendEmail: true,
            },
          },
        });
        sinon.assert.calledWithMatch(updateBrazeJobStub.secondCall, {
          userId: 584,
          attributes: {
            birthdate,
            city: city.toUpperCase(),
            country: 'US',
            firstName,
            lastName,
          },
          eventProperties: [
            { name: AnalyticsEvent.NameUpdated },
            { name: AnalyticsEvent.AddressUpdated },
          ],
        });
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.IDENTITY_VERIFICATION_ENDPOINT,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: '1269 S Cochran Ave',
              birthdate: '1980-01-01',
              city: 'Los Angeles',
              email: 'mick@rollingstone.biz',
              firstName: 'Mick',
              lastName: 'jagger',
              state: 'CA',
              zipCode: '90019',
            },
            modifications: {
              addressLine1: { currentValue: '1269 S COCHRAN AVE', previousValue: null },
              birthdate: { currentValue: moment('1980-01-01'), previousValue: null },
              city: { currentValue: 'LOS ANGELES', previousValue: null },
              firstName: { currentValue: 'Mick', previousValue: 'Louise' },
              lastName: { currentValue: 'jagger', previousValue: 'Belcher' },
              ssn: { currentValue: '123456789', previousValue: null },
              state: { currentValue: 'CA', previousValue: null },
              zipCode: { currentValue: '90019', previousValue: null },
            },
          },
        });
        sinon.assert.notCalled(updateSynapsepayUserJob);
        sinon.assert.calledWithExactly(userUpdatedEventStub, {
          userId: user.id,
          addressChanged: true,
          nameChanged: true,
        });
      }),
    );

    it(
      'should succeed + return a success status for a new user',
      replayHttp('domain/synapsepay/user/create-new-user.json', async () => {
        const upsertSynapsePayUserSpy = sandbox.spy(SynapsePay, 'upsertSynapsePayUser');
        const user = await factory.create('new-user', { id: 2601, phoneNumber: '+13837413729' });
        const createUserAsyncSpy = sandbox.spy(SynapsepayModels.users, 'createAsync');

        const result = await request(app)
          .post('/v2/identity_verification')
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .set('X-Forwarded-For', ip)
          .send(successPayload);
        const ssnDoc = (
          await createUserAsyncSpy.returnValues[0]
        ).json.documents[0].virtual_docs.find(
          (d: BasicSubDocument) => d.document_type === SynapsePay.DocumentType.SSN,
        );

        expect(ssnDoc.status).to.equal('SUBMITTED|REVIEWING');
        expect(result.status).to.equal(200);
        await user.reload();

        const [[userParam, ipParam, fieldParam]] = upsertSynapsePayUserSpy.args;
        expect(userParam.synapsepayId).to.equal(user.synapsepayId);
        expect(ipParam).to.equal(ip);
        expect(fieldParam).to.deep.equal({
          ...successPayload,
          addressLine2: undefined,
        });
        const { birthdate, city, firstName, lastName } = successPayload;
        sinon.assert.calledWithMatch(updateBrazeJobStub.firstCall, {
          userId: user.id,
          attributes: { email_verified: false },
          eventProperties: {
            name: AnalyticsEvent.EmailUnverified,
            properties: {
              unverifiedEmail: 'mick@rollingstone.biz',
              obfuscatedEmail: 'm****k@rollingstone.biz',
              url: sinon.match.string,
              sendEmail: true,
            },
          },
        });
        sinon.assert.calledWithMatch(updateBrazeJobStub.secondCall, {
          userId: user.id,
          attributes: {
            birthdate,
            city: city.toUpperCase(),
            country: 'US',
            firstName,
            lastName,
          },
          eventProperties: [
            { name: AnalyticsEvent.NameUpdated },
            { name: AnalyticsEvent.AddressUpdated },
          ],
        });
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.IDENTITY_VERIFICATION_ENDPOINT,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: '1269 S Cochran Ave',
              birthdate: '1980-01-01',
              city: 'Los Angeles',
              email: 'mick@rollingstone.biz',
              firstName: 'Mick',
              lastName: 'jagger',
              state: 'CA',
              zipCode: '90019',
            },
            modifications: {
              addressLine1: { currentValue: '1269 S COCHRAN AVE', previousValue: null },
              birthdate: { currentValue: moment('1980-01-01'), previousValue: null },
              city: { currentValue: 'LOS ANGELES', previousValue: null },
              firstName: { currentValue: 'Mick', previousValue: null },
              lastName: { currentValue: 'jagger', previousValue: null },
              ssn: { currentValue: '123456789', previousValue: null },
              state: { currentValue: 'CA', previousValue: null },
              zipCode: { currentValue: '90019', previousValue: null },
            },
          },
        });
        sinon.assert.notCalled(updateSynapsepayUserJob);
        sinon.assert.calledWithExactly(userUpdatedEventStub, {
          userId: user.id,
          addressChanged: true,
          nameChanged: true,
        });
      }),
    );

    context('when the submitted email address is already taken', async () => {
      let user: User;
      let result: request.Response;
      const email = 'testuser@dave.com';
      const payload = { ...successPayload, email } as { [key: string]: any };

      beforeEach(async () => {
        sandbox
          .stub(SynapsepayModels.users, 'createAsync')
          .resolves({ json: verifiedSuccessSynapseUser });
        sandbox.stub(gcloudKms, 'encrypt').callsFake(val => Bluebird.resolve({ ciphertext: val }));
        user = await factory.create('user');
        await factory.create('user', { email });
        const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');

        result = await request(app)
          .post('/v2/identity_verification')
          .set('Authorization', user.id.toString())
          .set('X-Device-Id', user.id.toString())
          .send(payload);
        sinon.assert.notCalled(emailVerificationHelperSpy);
        await user.reload();
      });

      it('should prompt the user to contact customer service', () => {
        expect(result.status).to.equal(409);
        expect(result.body.message).to.match(
          /A user with this email already exists, please enter a different email\./,
        );
      });
    });

    it('should succeed if same email is submitted again by the same user', async () => {
      sandbox
        .stub(SynapsepayModels.users, 'createAsync')
        .resolves({ json: verifiedSuccessSynapseUser });
      sandbox.stub(gcloudKms, 'encrypt').callsFake(val => Bluebird.resolve({ ciphertext: val }));
      await User.update({ email: successEmail }, { where: { id: 902 } });
      const result = await request(app)
        .post('/v2/identity_verification')
        .set('Authorization', 'token-902')
        .set('X-Device-Id', 'id-902')
        .send(successPayload);

      expect(result.status).to.equal(200);
      expect(result.body.approved).to.equal(true);
      expect(updateBrazeJobStub).to.be.calledOnce;
      expect(userUpdatedEventStub).to.be.calledOnce;
    });

    it('sends a verification email', async () => {
      sandbox
        .stub(SynapsepayModels.users, 'createAsync')
        .resolves({ json: verifiedSuccessSynapseUser });
      sandbox.stub(gcloudKms, 'encrypt').callsFake(val => Bluebird.resolve({ ciphertext: val }));
      const broadcastEmailUnverifiedStub = sandbox.stub(
        UserUpdatesDomain,
        'broadcastEmailUnverified',
      );

      await request(app)
        .post('/v2/identity_verification')
        .set('Authorization', 'token-902')
        .set('X-Device-Id', 'id-902')
        .send(successPayload);

      sinon.assert.calledOnce(broadcastEmailUnverifiedStub);
      const [emailVerification] = await EmailVerification.findAll({
        where: {
          email: 'mick@rollingstone.biz',
        },
      });

      expect(emailVerification.userId).to.equal(902);
      expect(emailVerification.verified).to.not.exist;
    });

    it('should reject an invalid email', async () => {
      const response = await request(app)
        .post('/v2/identity_verification')
        .set('Authorization', 'token-902')
        .set('X-Device-Id', 'id-902')
        .send({
          firstName: 'Bill',
          lastName: 'Kreuzman',
          email: 'billkreuzman@ dead.net',
          addressLine1: '1269 S Cochran Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
          birthdate: '1980-01-01',
          ssn: '123456789',
        });
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Please enter a valid email/);
    });
  });

  describe('PATCH /v2/identity_verification', () => {
    beforeEach(() => up());

    it('should fail if the license was not provided', async () => {
      const result = await request(app)
        .patch('/v2/identity_verification')
        .set('Authorization', 'token-902')
        .set('X-Device-Id', 'id-902')
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/No image provided/);
    });
  });
});
