import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  UserAccountChecks,
  UserRole,
} from '@dave-inc/wire-typings';
import * as bcrypt from 'bcrypt';
import { expect } from 'chai';
import * as config from 'config';
import { times } from 'lodash';
import { Op } from 'sequelize';
import * as sinon from 'sinon';
import * as request from 'supertest';
import * as uuid from 'uuid';
import Firebase from '../../../src/lib/firebase';

import app from '../../../src/api';
import { client as DaveBankingClient } from '../../../src/api/v2/user/controller';
import { VPN_IP } from '../../../src/api/v2/user/rate-limit';

import PlaidSource from '../../../src/domain/banking-data-source/plaid/integration';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import * as eventDomain from '../../../src/domain/event';
import { recordEvent } from '../../../src/domain/event';
import {
  LIMIT_OF_USERS_TO_BUCKET_TO_MX,
  MINIMUM_APP_VERSION_TO_BUCKET_MX,
} from '../../../src/domain/experiment/bank-connection-source-experiment';
import phoneNumberVerification from '../../../src/domain/phone-number-verification';
import * as SynapsepayLib from '../../../src/domain/synapsepay';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import * as UserUpdatesDomain from '../../../src/domain/user-updates';

import * as EmailVerificationHelper from '../../../src/helper/email-verification';
import UserHelper from '../../../src/helper/user';
import * as identityApi from '../../../src/domain/identity-api';

import { agent as verifyAgent } from '../../../src/lib/address-verification';
import braze from '../../../src/lib/braze';
import amplitude from '../../../src/lib/amplitude';
import * as appsFlyer from '../../../src/lib/appsflyer';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import {
  CUSTOM_ERROR_CODES,
  NotSupportedError,
  TwilioError,
  USPSResponseError,
} from '../../../src/lib/error';
import gcloudStorage from '../../../src/lib/gcloud-storage';
import redis from '../../../src/lib/redis';
import { USPSApi } from '../../../src/lib/usps';
import sendgrid from '../../../src/lib/sendgrid';
import { ACTIVE_TIMESTAMP } from '../../../src/lib/sequelize';
import twilio from '../../../src/lib/twilio';
import { toE164 } from '../../../src/lib/utils';
import { encode, decode } from '../../../src/lib/jwt';
import * as AccountChecks from '../../../src/api/v2/user/account-checks';

import {
  ABTestingEvent,
  AuditLog,
  BankAccount,
  DeleteRequest,
  RedeemedSubscriptionBillingPromotion,
  SynapsepayDocument,
  User,
} from '../../../src/models';
import Payment from '../../../src/models/payment';

import * as sombraClient from '../../../src/services/sombra/client';
import { ABTestingEventName, AnalyticsEvent, SettingId } from '../../../src/typings';
import * as Jobs from '../../../src/jobs/data';

import { setupSynapsePayUser } from '../../domain/synapsepay/test-utils';
import factory from '../../factories';
import userSchema from '../../schema/user';
import {
  clean,
  createVerificationCode,
  replayHttp,
  stubLoomisClient,
  up,
} from '../../test-helpers';
import { USPSErrorKey } from '../../../src/translations';

describe('/v2/user/*', () => {
  const sandbox = sinon.createSandbox();

  let fraudCheckJobStub: sinon.SinonStub;
  let deleteSynapsePayUserStub: sinon.SinonStub;
  let updateSynapsepayTask: sinon.SinonStub;
  let userUpdatedEventPublishStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(function() {
    this.mobileStub = sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
    deleteSynapsePayUserStub = sandbox.stub(SynapsepayLib, 'deleteSynapsePayUser').resolves();
    fraudCheckJobStub = sandbox.stub(Jobs, 'createFraudCheckTask');
    updateSynapsepayTask = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
    sandbox.stub(PlaidSource.prototype, 'deleteNexus').resolves();
    userUpdatedEventPublishStub = sandbox.stub(eventDomain.userUpdatedEvent, 'publish').resolves();
    sandbox.stub(sombraClient, 'exchangeSession').resolves();
    sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  // Deprecated endpoint
  describe('POST /v2/user/verify', () => {
    const minAppVersion = config.get<string>('minAppVersion.sendVerification');
    beforeEach(() => up());
    context(`X-App-Version >= ${minAppVersion}`, () => {
      it('should fail if the phone number was not provided', async () => {
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send();
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not provided: phoneNumber/);
      });

      it('should fail if the phone number provided was not valid', async () => {
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: 'foobar' });
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not seem to be a phone number/);
      });

      it('should fail if the phone number is voip', async function() {
        this.mobileStub.resolves({ isMobile: false });
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', verificationCodeOnly: true });

        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/gotta use your real number/);
      });

      it('should handle twilio errors with aplomb', async () => {
        sandbox.stub(twilio, 'send').rejects(new NotSupportedError());

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', verificationCodeOnly: true });
        expect(result.status).to.equal(405);
      });

      it('should fail if the user is unsubscribed from text messages', async () => {
        await factory.create('user', {
          unsubscribed: true,
          phoneNumber: '+16505551212',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(201);
      });

      it('should fail if the user deleted their account less than 60 days ago and is not overridden', async () => {
        const deletedTimestamp = moment()
          .subtract(1, 'month')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should succeed if the user deleted their account less than 60 days ago and is overridden', async () => {
        sandbox.stub(twilio, 'send').resolves();
        sandbox.stub(sendgrid, 'send').resolves();

        const deletedTimestamp = moment()
          .subtract(1, 'month')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
          overrideSixtyDayDelete: true,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212' });
        expect(result.status).to.equal(200);
        expect(result.body.isNewUser).to.be.true;
      });

      it('should succeed if the user deleted their account more than 60 days ago', async () => {
        sandbox.stub(twilio, 'send').resolves();

        const deletedTimestamp = moment()
          .subtract(3, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(200);
        expect(result.body.isNewUser).to.be.true;
      });

      it('should succeed and have nothing in the body if verificationCodeOnly', async () => {
        sandbox.stub(twilio, 'send').resolves();
        await factory.create('user', { phoneNumber: '+16505551212' });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212', verificationCodeOnly: true });

        expect(result.status).to.equal(200);
        expect(result.body).to.be.empty;
      });

      it('should fail if a user had an override but deleted their account a second time', async function() {
        sandbox.stub(twilio, 'send').resolves();
        this.mobileStub.resolves({ isMobile: false });

        const firstDeletedTimestamp = moment()
          .subtract(2, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-1',
          created: firstDeletedTimestamp,
          deleted: firstDeletedTimestamp,
          overrideSixtyDayDelete: true,
        });

        const secondDeletedTimestamp = moment()
          .subtract(1, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-2',
          created: secondDeletedTimestamp,
          deleted: secondDeletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should send verification code when verificationCodeOnly = true', async () => {
        const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', verificationCodeOnly: true });
        expect(result.status).to.equal(200);
        expect(sendStub).to.have.callCount(1);

        const callArgs = sendStub.firstCall.args[0];
        expect(callArgs.e164PhoneNumber).to.equal('+16518006069');
      });

      it('should send verification code and return {isNewUser: true} for new users', async () => {
        const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', verificationCodeOnly: false, isSignUp: true });
        expect(result.status).to.equal(200);
        expect(result.body.isNewUser).to.be.true;
        expect(sendStub).to.have.callCount(1);
      });

      it('should send appropriate values for when user has set a password', async () => {
        await factory.create('user', {
          phoneNumber: '+16518006069',
          email: 'user@dave.com',
          password: 'passwordweeeee',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069' });
        expect(result.status).to.equal(200);
        expect(result.body.hasProvidedEmailAddress).to.be.true;
        expect(result.body.hasCreatedPassword).to.be.true;
      });

      it('should send appropriate values, when user has set email', async () => {
        sandbox.stub(twilio, 'send').resolves();
        const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
        await factory.create('user', {
          phoneNumber: '+16518006069',
          email: 'user@dave.com',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069' });
        expect(result.status).to.equal(200);
        expect(sendgridStub).to.have.callCount(1);
        expect(result.body.hasProvidedEmailAddress).to.be.true;
        expect(result.body.hasCreatedPassword).to.be.false;
        expect(result.body.email).to.eq('u****r@dave.com');
      });

      it('should send appropriate values but no email, if during sign up and user has email set', async () => {
        sandbox.stub(twilio, 'send').resolves();
        const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
        await factory.create('user', {
          phoneNumber: '+16518006069',
          email: 'user@dave.com',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', isSignUp: true });
        expect(result.status).to.equal(200);
        expect(sendgridStub).to.have.callCount(0);
        expect(result.body.hasProvidedEmailAddress).to.be.true;
        expect(result.body.hasCreatedPassword).to.be.false;
        expect(result.body.email).to.eq('u****r@dave.com');
      });

      it('should send appropriate values, when user has set email and multiple deleted accounts', async () => {
        const deletedTimestamp = moment().subtract(1, 'month');

        sandbox.stub(twilio, 'send').resolves();
        const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
        await Promise.all([
          factory.create('user', {
            phoneNumber: '+16518006069',
            email: 'user@dave.com',
          }),
          factory.create('user', {
            phoneNumber: '+16518006069-deleted-1',
            email: 'user@dave.com',
            deleted: deletedTimestamp.format('YYYY-MM-DD HH:mm:ss'),
          }),
          factory.create('user', {
            phoneNumber: '+16518006069-deleted-2',
            email: 'user@dave.com',
            deleted: deletedTimestamp.subtract(1, 'month').format('YYYY-MM-DD HH:mm:ss'),
          }),
          factory.create('user', {
            phoneNumber: '+16518006069-deleted-3',
            email: 'user@dave.com',
            deleted: deletedTimestamp.subtract(2, 'month').format('YYYY-MM-DD HH:mm:ss'),
          }),
        ]);
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069' });

        expect(result.status).to.equal(200);
        expect(sendgridStub).to.have.callCount(1);
        expect(result.body.hasProvidedEmailAddress).to.be.true;
        expect(result.body.hasCreatedPassword).to.be.false;
        expect(result.body.email).to.eq('u****r@dave.com');
      });

      it('should send appropriate values and check for contract change when user has no email and no password', async () => {
        const sendStub = sandbox.stub(twilio, 'send').resolves();
        const contractChangedStub = sandbox.stub(twilio, 'checkForContractChange').resolves(false);
        await factory.create('user', {
          phoneNumber: '+16518006069',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', minAppVersion)
          .send({ phoneNumber: '6518006069', isSignUp: false });
        expect(result.status).to.equal(200);
        expect(sendStub).to.have.callCount(1);
        expect(contractChangedStub).to.have.callCount(1);
        expect(result.body.hasProvidedEmailAddress).to.be.false;
        expect(result.body.hasCreatedPassword).to.be.false;
        expect(result.body.hasTwilioContractChanged).to.be.false;
      });
    });

    context('X-App-Version < 2.8.0', () => {
      it('should fail if the phone number was not provided', async () => {
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({});
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not provided: phoneNumber/);
      });

      it('should fail if the phone number provided was not valid', async () => {
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: 'foobar' });
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not seem to be a phone number/);
      });

      it('should fail if the phone number is voip', async function() {
        this.mobileStub.resolves({ isMobile: false });
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6518006069' });

        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/gotta use your real number/);
      });

      it('should succeed if the phone number is voip but the user already has an account', async function() {
        sandbox.stub(twilio, 'send').resolves();
        this.mobileStub.resolves({ isMobile: false });
        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '1000000001' });

        expect(result.status).to.equal(200);
      });

      it('should handle twilio errors with aplomb', async () => {
        sandbox.stub(twilio, 'send').rejects(new NotSupportedError());

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6518006069' });
        expect(result.status).to.equal(405);
      });

      it('should fail if the user is unsubscribed from text messages', async () => {
        await factory.create('user', {
          unsubscribed: true,
          phoneNumber: '+16505551212',
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(201);
      });

      it('should fail if the user deleted their account less than 60 days ago and is not overridden', async () => {
        const deletedTimestamp = moment()
          .subtract(1, 'month')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should succeed if the user deleted their account less than 60 days ago and is overridden', async function() {
        sandbox.stub(twilio, 'send').resolves();
        this.mobileStub.resolves({ isMobile: false });

        const deletedTimestamp = moment()
          .subtract(1, 'month')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
          overrideSixtyDayDelete: true,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(200);
      });

      it('should succeed if the user deleted their account more than 60 days ago', async function() {
        sandbox.stub(twilio, 'send').resolves();
        this.mobileStub.resolves({ isMobile: false });

        const deletedTimestamp = moment()
          .subtract(3, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-',
          deleted: deletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(200);
      });

      it('should fail if a user had an override but deleted their account a second time', async function() {
        sandbox.stub(twilio, 'send').resolves();
        this.mobileStub.resolves({ isMobile: false });

        const firstDeletedTimestamp = moment()
          .subtract(2, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-1',
          created: firstDeletedTimestamp,
          deleted: firstDeletedTimestamp,
          overrideSixtyDayDelete: true,
        });

        const secondDeletedTimestamp = moment()
          .subtract(1, 'months')
          .format('YYYY-MM-DD HH:mm:ss');
        await factory.create('user', {
          phoneNumber: '+16505551212-deleted-2',
          created: secondDeletedTimestamp,
          deleted: secondDeletedTimestamp,
        });

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6505551212' });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should send verification code', async () => {
        const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/verify')
          .set('X-App-Version', '2.7.10')
          .send({ phoneNumber: '6518006069' });
        expect(result.status).to.equal(200);

        expect(sendStub).to.have.callCount(1);
        const callArgs = sendStub.firstCall.args[0];
        expect(callArgs.e164PhoneNumber).to.equal('+16518006069');
      });
    });
  });

  describe('POST /v2/user', () => {
    it('should fail if the phone number or code was not provided', async () => {
      const result = await request(app)
        .post('/v2/user')
        .send({});
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/not provided/);
    });

    it('should fail if the code + phone number do not match', async () => {
      const result = await request(app)
        .post('/v2/user')
        .send({ phoneNumber: '6518006069', code: '123456' });
      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/code is invalid/);
    });

    it('should fail if the code is a legacy MFA code length of 4', async () => {
      const result = await request(app)
        .post('/v2/user')
        .send({ phoneNumber: '6518006069', code: '1234' });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain(
        'Please download the latest version of Dave to continue.',
      );
    });

    it('should fail if user is flagged with fraud', async () => {
      const phoneNumber = '+15555555555';
      await factory.create('user', {
        phoneNumber,
        fraud: true,
      });

      await createVerificationCode({ phoneNumber, code: '111111' });

      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '111111' });
      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/contact Member Success/);
    });

    it('should create/log in the user', async () => {
      const brazeStub = sandbox.stub(braze, 'track');
      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456' });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(brazeStub).to.be.calledWith({ events: [sinon.match({ name: 'user created' })] });
    });

    it('should create user and bucket to bank connection source experiment', async () => {
      const brazeStub = sandbox.stub(braze, 'track');
      const phoneNumber = '+16518096769';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', MINIMUM_APP_VERSION_TO_BUCKET_MX)
        .send({ phoneNumber, code: '123456' });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(brazeStub).to.be.calledWith({
        events: [sinon.match({ name: 'user created', externalId: String(result.body.id) })],
      });

      const bucketed = Boolean(
        await ABTestingEvent.findOne({
          where: {
            userId: result.body.id,
            eventName: {
              [Op.in]: [
                ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
                ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
              ],
            },
          },
        }),
      );

      expect(bucketed).to.be.true;
    });

    it('should create user, and not bucket to bank connection source experiment because of limit', async () => {
      // Simulate scenario of max number of users in experiment bucket
      await ABTestingEvent.bulkCreate(
        Array(LIMIT_OF_USERS_TO_BUCKET_TO_MX).fill({
          eventName: ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
        }),
      );

      const brazeStub = sandbox.stub(braze, 'track');
      const phoneNumber = '+16518096769';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456' });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(brazeStub).to.be.calledWith({
        events: [sinon.match({ name: 'user created', externalId: String(result.body.id) })],
      });

      const bucketed = Boolean(
        await ABTestingEvent.findOne({
          where: {
            userId: result.body.id,
            eventName: {
              [Op.in]: [
                ABTestingEventName.BucketedIntoMxBankConnectionSourceExperiment,
                ABTestingEventName.BucketedIntoPlaidBankConnectionSourceExperiment,
              ],
            },
          },
        }),
      );

      expect(bucketed).to.be.false;
    });

    it('should track user created properly', async () => {
      const deviceId = 'bar';

      const brazeStub = sandbox.stub(braze, 'track');
      const amplitudeStub = sandbox.stub(amplitude, 'track');
      const appsFlyerStub = sandbox.stub(appsFlyer, 'logAppsflyerEvent');

      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', deviceId)
        .set('X-Device-Type', 'ios')
        .set('X-AppsFlyer-ID', 'test')
        .send({ phoneNumber: '6518006069', code: '123456' });

      expect(result.status).to.equal(200);

      sinon.assert.calledWith(brazeStub, {
        events: [
          {
            name: AnalyticsEvent.UserCreated,
            externalId: sinon.match.string,
            time: sinon.match.instanceOf(moment),
          },
        ],
      });
      sinon.assert.calledWith(amplitudeStub, {
        userId: sinon.match.number,
        eventType: AnalyticsEvent.UserCreated,
      });
      sinon.assert.calledWith(appsFlyerStub, {
        userId: sinon.match.number,
        eventName: appsFlyer.AppsFlyerEvents.USER_CREATED,
        platform: 'ios',
        appsflyerDeviceId: 'test',
      });
    });

    it('should rate limit user creation after 5 failed attempts with the same phone number', async () => {
      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      for (let i = 0; i < 5; i++) {
        const result = await request(app)
          .post('/v2/user')
          .set('X-Device-Id', `bar${i}`)
          .set('X-Device-Type', 'ios')
          .send({ phoneNumber, code: '000000' });
        expect(result.status).to.equal(401);
      }

      const result6 = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar4')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '000000' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed code verification attempts. Please try again in a few minutes./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.create_user');

      const result7 = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar5')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed code verification attempts. Please try again in a few minutes./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.create_user');
    });

    it('should rate limit user creation after 5 failed attempts with the same device ID', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      for (let i = 0; i < 5; i++) {
        const result = await request(app)
          .post('/v2/user')
          .set('X-Device-Id', 'bar')
          .set('X-Device-Type', 'ios')
          .send({ phoneNumber: '6518006070', code: '000000' });
        expect(result.status).to.equal(401);
      }

      const result6 = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber: '6518006073', code: '000000' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed code verification attempts. Please try again in a few minutes./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.create_user');

      const result7 = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber: '6518006074', code: '123456' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed code verification attempts. Please try again in a few minutes./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.create_user');
    });

    it('should should create the user', async () => {
      const brazeStub = sandbox.stub(braze, 'track');
      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456' });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(brazeStub).to.be.calledWith({ events: [sinon.match({ name: 'user created' })] });
    });

    it('should create with an email if the email is valid', async () => {
      const brazeStub = sandbox.stub(braze, 'track');
      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456', email: 'bobweir@dead.net' });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(brazeStub).to.be.calledWith({ events: [sinon.match({ name: 'user created' })] });
    });

    it('should not create the if the email address has a space in it', async () => {
      const phoneNumber = '+16518006069';
      await createVerificationCode({ phoneNumber, code: '123456' });
      const result = await request(app)
        .post('/v2/user')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .send({ phoneNumber, code: '123456', email: 'bobwei r@dead.net' });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please enter a valid email/);
    });
  });

  describe('GET /v2/user', () => {
    before(async () => await factory.create('user-setting-name', { id: 3, name: 'ShowBanner' }));
    beforeEach(() => up());
    it('should fail gracefully if the user is not logged in', async () => {
      const result = await request(app)
        .get('/v2/user')
        .set('Authorization', 'foo')
        .set('X-Device-Id', 'bar');

      expect(result.status).to.equal(401);
    });

    it('should get the logged in user', async () => {
      const result = await request(app)
        .get('/v2/user')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
    });

    it('should include the paused membership record if the membership is currently paused', async () => {
      const user = await factory.create('user');
      const pausedAt = moment('2019-12-05');
      await factory.create('membership-pause', {
        userId: user.id,
        pausedAt,
      });

      const result = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body.membershipPause.userId).to.equal(user.id);
      expect(result.body.membershipPause.isActive).to.equal(true);
      expect(result.body.membershipPause.unpausedAt).to.be.sameMoment(moment(ACTIVE_TIMESTAMP));
      expect(result.body.membershipPause.pausedAt).to.be.sameMoment(pausedAt);
    });

    it('should return hardcoded banking fields', async () => {
      const user = await factory.create('user', {}, { roles: UserRole.v2BankTester });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.canSignUpForBanking).to.be.true;
      expect(result.canSignUpForBankingV2).to.be.true;
      expect(result.isOnBankWaitlist).to.be.false;
    });

    it('should return appropriate userIsTester field', async () => {
      const user = await factory.create('user', {}, { roles: [UserRole.tester] });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.canSignUpForBanking).to.be.true;
      expect(result.tester).to.be.true;
    });

    it('should return false for password update for user created past cutoff', async () => {
      const user = await factory.create('user');
      await factory.create('password-history', {
        userId: user.id,
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.requiresPasswordUpdate).to.be.false;
    });

    it('should return true for password update if user has one password_history record and was created before the cutoff date', async () => {
      const user = await factory.create('user', {
        created: moment('2020-06-29T06:00:00Z'),
      });

      await factory.create('password-history', {
        userId: user.id,
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.requiresPasswordUpdate).to.be.true;
    });

    it('should return false for password update if user has more than one password_history record and was created before the cutoff date', async () => {
      const user = await factory.create('user', {
        created: moment('2020-06-29T06:00:00Z'),
      });

      await factory.create('password-history', {
        userId: user.id,
      });

      await factory.create('password-history', {
        userId: user.id,
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.requiresPasswordUpdate).to.be.false;
    });

    it('should return false for showBanner if not flagged', async () => {
      const user = await factory.create('user');

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.showBanner).to.be.false;
    });

    it('should return true for showBanner if flagged', async () => {
      const user = await factory.create('user');
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'true',
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.showBanner).to.be.true;
    });

    it('should return true for showBanner if flagged with weird casing', async () => {
      const user = await factory.create('user');
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'TrUE',
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.showBanner).to.be.true;
    });

    it('should return false for showBanner if flagged with non true', async () => {
      const user = await factory.create('user');
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'nonsense',
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.showBanner).to.be.false;
    });

    it('should return true for showBanner if have multiple rows, but one with true', async () => {
      const user = await factory.create('user');
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'nonsense',
      });
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'false',
      });
      await factory.create('user-setting', {
        userId: user.id,
        userSettingNameId: SettingId.showbanner,
        value: 'true',
      });

      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.showBanner).to.be.true;
    });

    it('should return externalId', async () => {
      const ulid = 'a'.repeat(26);
      const user = await factory.create<User>('user', { userUlid: ulid });
      const { body: result } = await request(app)
        .get('/v2/user')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(result.externalId).to.equal(ulid);
    });
  });

  describe('PATCH /v2/user', () => {
    let auditLogStub: sinon.SinonStub;
    let updateBrazeJobStub: sinon.SinonStub;

    beforeEach(() => {
      auditLogStub = sandbox.stub(AuditLog, 'create');
      updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(true);
    });

    it('should update the user first and last name', async () => {
      const user = await factory.create('user', {
        firstName: 'Notmark',
        lastName: 'Notruffalo',
      });
      const result = await request(app)
        .patch('/v2/user')
        .send({ firstName: 'Mark', lastName: 'Ruffalo' })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(result.body.firstName).to.equal('Mark');
      expect(result.body.lastName).to.equal('Ruffalo');
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { firstName: 'Mark', lastName: 'Ruffalo' },
        eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
      });
      sinon.assert.calledWithExactly(updateSynapsepayTask, {
        userId: user.id,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            city: undefined,
            state: undefined,
            zipCode: undefined,
            birthdate: undefined,
            firstName: 'Mark',
            lastName: 'Ruffalo',
            license: undefined,
          },
        },
      });
      sinon.assert.calledWithExactly(auditLogStub, {
        userId: user.id,
        type: AuditLog.TYPES.USER_PROFILE_UPDATE,
        successful: true,
        extra: {
          requestPayload: {
            firstName: 'Mark',
            lastName: 'Ruffalo',
          },
          modifications: {
            firstName: {
              previousValue: 'Notmark',
              currentValue: 'Mark',
            },
            lastName: {
              previousValue: 'Notruffalo',
              currentValue: 'Ruffalo',
            },
          },
        },
      });
    });

    it('updates given last name only', async () => {
      const user = await factory.create('user', {
        firstName: 'Mark',
        lastName: 'Ruffalo',
      });
      const result = await request(app)
        .patch('/v2/user')
        .send({ lastName: 'MenCanChangeTheirLastNamesToo' })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(200);

      await user.reload();
      expect(result.body.firstName).to.equal('Mark');
      expect(result.body.lastName).to.equal('MenCanChangeTheirLastNamesToo');
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { firstName: 'Mark', lastName: 'MenCanChangeTheirLastNamesToo' },
        eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
      });
      sinon.assert.calledWithExactly(updateSynapsepayTask, {
        userId: user.id,
        options: {
          fields: {
            addressLine1: undefined,
            addressLine2: undefined,
            city: undefined,
            state: undefined,
            zipCode: undefined,
            birthdate: undefined,
            firstName: 'Mark',
            lastName: 'MenCanChangeTheirLastNamesToo',
            license: undefined,
          },
        },
      });
      sinon.assert.calledWithExactly(auditLogStub, {
        userId: user.id,
        type: AuditLog.TYPES.USER_PROFILE_UPDATE,
        successful: true,
        extra: {
          requestPayload: {
            lastName: 'MenCanChangeTheirLastNamesToo',
          },
          modifications: {
            lastName: {
              previousValue: 'Ruffalo',
              currentValue: 'MenCanChangeTheirLastNamesToo',
            },
          },
        },
      });
    });

    it('should prevent validated users from updating first and last name', async () => {
      const doc = await factory.create('synapsepay-document');
      const user = await User.findOne({ where: { id: doc.userId } });
      await user.update({ firstName: 'Notmark', lastName: 'Notruffalo' });
      sandbox.stub(console, 'error');
      const result = await request(app)
        .patch('/v2/user')
        .send({ firstName: 'Mark', lastName: 'Ruffalo' })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result.status).to.equal(400);
      expect(updateBrazeJobStub.notCalled).to.be.true;
      expect(updateSynapsepayTask.notCalled).to.be.true;
    });

    it('should allow validated users to update first and last name if from bank sign up', async () => {
      const user = await factory.create('user', {
        firstName: 'Mark',
        lastName: 'Ruffalo',
      });
      await user.update({ firstName: 'Notmark', lastName: 'Notruffalo' });

      const result = await request(app)
        .patch('/v2/user')
        .send({ firstName: 'Mark', lastName: 'Ruffalo', isDaveBankingSignUp: true })
        .set('Authorization', user.id.toString())
        .set('X-Device-Id', user.id.toString());

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(result.body.firstName).to.equal('Mark');
      expect(result.body.lastName).to.equal('Ruffalo');
      expect(updateBrazeJobStub).to.be.calledOnce;
      expect(updateSynapsepayTask).to.be.calledOnce;
    });

    it(
      'should skip address verification from synapse',
      replayHttp(
        'v2/user/skip-address-verification.json',
        async () => {
          const oldAddress = {
            addressLine1: '1265 S Cochran Ave',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90019',
          };
          const user = await factory.create('user', oldAddress);
          const addressUpdate = {
            addressLine1: '817 N Euclid Ave',
            city: 'Pasadena',
            state: 'CA',
            zipCode: '91104',
            skipAddressVerification: true,
          };
          const addressVerificationSpy = sandbox.spy(verifyAgent, 'post');
          await request(app)
            .patch('/v2/user')
            .send(addressUpdate)
            .set('Authorization', user.id)
            .set('X-Device-Id', user.id)
            .expect(200);
          await user.reload();
          expect(user.addressLine1).to.equal(addressUpdate.addressLine1);
          expect(user.addressLine2).not.to.exist;
          expect(user.city).to.equal(addressUpdate.city);
          expect(user.state).to.equal(addressUpdate.state);
          expect(user.zipCode).to.equal(addressUpdate.zipCode);
          sinon.assert.calledWith(auditLogStub, {
            userId: user.id,
            type: AuditLog.TYPES.USER_PROFILE_UPDATE,
            successful: true,
            extra: {
              requestPayload: {
                addressLine1: addressUpdate.addressLine1,
                city: addressUpdate.city,
                state: addressUpdate.state,
                zipCode: addressUpdate.zipCode,
                skipAddressVerification: true,
              },
              modifications: {
                addressLine1: {
                  previousValue: oldAddress.addressLine1,
                  currentValue: addressUpdate.addressLine1,
                },
                city: {
                  previousValue: oldAddress.city,
                  currentValue: addressUpdate.city,
                },
                zipCode: {
                  previousValue: oldAddress.zipCode,
                  currentValue: addressUpdate.zipCode,
                },
              },
            },
          });
          sinon.assert.notCalled(addressVerificationSpy);
          sinon.assert.calledWithExactly(updateSynapsepayTask, {
            userId: user.id,
            options: {
              fields: {
                addressLine1: user.addressLine1,
                addressLine2: undefined,
                city: user.city,
                state: user.state,
                zipCode: user.zipCode,
                firstName: undefined,
                lastName: undefined,
                birthdate: undefined,
                license: undefined,
              },
            },
          });
        },
        { mode: 'wild' },
      ),
    );

    it(
      'updates address',
      replayHttp('v2/user/valid-address.json', async () => {
        const oldAddress = {
          addressLine1: '1265 S Cochran Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
        };
        const user = await factory.create('user', { ...oldAddress });
        const addressUpdate = {
          addressLine1: '6201 S Knox ave',
          addressLine2: 'Unit C',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60629',
        };
        await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200);

        await user.reload();
        expect(user.addressLine1).to.equal(addressUpdate.addressLine1);
        expect(user.addressLine2).to.equal(addressUpdate.addressLine2);
        expect(user.city).to.equal(addressUpdate.city.toUpperCase());
        expect(user.state).to.equal(addressUpdate.state);
        expect(user.zipCode).to.equal(addressUpdate.zipCode);
        sinon.assert.calledWithExactly(updateBrazeJobStub, {
          userId: user.id,
          attributes: { city: addressUpdate.city.toUpperCase(), country: 'US' },
          eventProperties: [{ name: AnalyticsEvent.AddressUpdated }],
        });
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.USER_PROFILE_UPDATE,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: addressUpdate.addressLine1,
              addressLine2: addressUpdate.addressLine2,
              city: addressUpdate.city,
              state: addressUpdate.state,
              zipCode: addressUpdate.zipCode,
            },
            modifications: {
              addressLine1: {
                previousValue: '1265 S Cochran Ave',
                currentValue: '6201 S Knox ave',
              },
              addressLine2: { previousValue: null, currentValue: 'Unit C' },
              city: { previousValue: 'Los Angeles', currentValue: 'CHICAGO' },
              state: { previousValue: 'CA', currentValue: 'IL' },
              zipCode: { previousValue: '90019', currentValue: '60629' },
            },
          },
        });
        sinon.assert.calledWithExactly(updateSynapsepayTask, {
          userId: user.id,
          options: {
            fields: {
              addressLine1: user.addressLine1,
              addressLine2: user.addressLine2,
              city: user.city,
              state: user.state,
              zipCode: user.zipCode,
              firstName: undefined,
              lastName: undefined,
              birthdate: undefined,
              license: undefined,
            },
          },
        });
        sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
          addressChanged: true,
          userId: user.id,
        });
      }),
    );

    it(
      'updates address to US territories',
      replayHttp('v2/user/move-to-us-territory.json', async () => {
        const oldAddress = {
          addressLine1: '1265 S Cochran Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
        };
        const user = await factory.create('user', { ...oldAddress });
        const addressUpdate = {
          addressLine1: '301 PR-26',
          city: 'SAN JUAN',
          state: 'PR',
          zipCode: '00918',
        };
        await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200);

        await user.reload();
        expect(user.addressLine1).to.equal(addressUpdate.addressLine1);
        expect(user.city).to.equal(addressUpdate.city.toUpperCase());
        expect(user.state).to.equal(addressUpdate.state);
        expect(user.zipCode).to.equal(addressUpdate.zipCode);
        sinon.assert.calledWithExactly(updateBrazeJobStub, {
          userId: user.id,
          attributes: { city: addressUpdate.city, country: 'PR' },
          eventProperties: [{ name: AnalyticsEvent.AddressUpdated }],
        });
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.USER_PROFILE_UPDATE,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: addressUpdate.addressLine1,
              city: addressUpdate.city,
              state: addressUpdate.state,
              zipCode: addressUpdate.zipCode,
            },
            modifications: {
              addressLine1: {
                previousValue: oldAddress.addressLine1,
                currentValue: addressUpdate.addressLine1,
              },
              city: { previousValue: oldAddress.city, currentValue: addressUpdate.city },
              state: { previousValue: oldAddress.state, currentValue: addressUpdate.state },
              zipCode: { previousValue: oldAddress.zipCode, currentValue: addressUpdate.zipCode },
            },
          },
        });
        sinon.assert.calledWithExactly(updateSynapsepayTask, {
          userId: user.id,
          options: {
            fields: {
              addressLine1: user.addressLine1,
              addressLine2: undefined,
              city: user.city,
              state: user.state,
              zipCode: user.zipCode,
              firstName: undefined,
              lastName: undefined,
              birthdate: undefined,
              license: undefined,
            },
          },
        });
        sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
          addressChanged: true,
          userId: user.id,
        });
      }),
    );

    it(
      'updates address from US territories',
      replayHttp('v2/user/move-from-us-territory.json', async () => {
        const oldAddress = {
          addressLine1: '301 PR-26',
          city: 'SAN JUAN',
          state: 'PR',
          zipCode: '00918',
        };
        const user = await factory.create('user', { ...oldAddress });
        const addressUpdate = {
          addressLine1: '1800 BARKER CYPRESS RD',
          city: 'HOUSTON',
          state: 'TX',
          zipCode: '77084',
        };
        await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200);

        await user.reload();
        expect(user.addressLine1).to.equal(addressUpdate.addressLine1);
        expect(user.city).to.equal(addressUpdate.city.toUpperCase());
        expect(user.state).to.equal(addressUpdate.state);
        expect(user.zipCode).to.equal(addressUpdate.zipCode);
        expect(updateBrazeJobStub).to.be.calledOnce;
        expect(userUpdatedEventPublishStub).to.be.calledOnce;
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.USER_PROFILE_UPDATE,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: addressUpdate.addressLine1,
              city: addressUpdate.city,
              state: addressUpdate.state,
              zipCode: addressUpdate.zipCode,
            },
            modifications: {
              addressLine1: {
                previousValue: oldAddress.addressLine1,
                currentValue: addressUpdate.addressLine1,
              },
              city: { previousValue: oldAddress.city, currentValue: addressUpdate.city },
              state: { previousValue: oldAddress.state, currentValue: addressUpdate.state },
              zipCode: { previousValue: oldAddress.zipCode, currentValue: addressUpdate.zipCode },
            },
          },
        });
        sinon.assert.calledWithExactly(updateSynapsepayTask, {
          userId: user.id,
          options: {
            fields: {
              addressLine1: user.addressLine1,
              addressLine2: undefined,
              city: user.city,
              state: user.state,
              zipCode: user.zipCode,
              firstName: undefined,
              lastName: undefined,
              birthdate: undefined,
              license: undefined,
            },
          },
        });
        sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
          addressChanged: true,
          userId: user.id,
        });
      }),
    );

    it(
      'sets addressLine2 to null when old address had addressLine2 but new address does not',
      replayHttp('v2/user/no-addressline2.json', async () => {
        const oldAddress = {
          addressLine1: '1265 S Cochran Ave',
          addressLine2: 'Unit 0',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
        };
        const user = await factory.create('user', oldAddress);
        const addressUpdate = {
          addressLine1: '1800 Barker Cypress Rd',
          city: 'Houston',
          state: 'TX',
          zipCode: '77084',
        };
        await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200);
        await user.reload();
        expect(user.addressLine1).to.equal(addressUpdate.addressLine1.toUpperCase());
        expect(user.addressLine2).to.be.null;
        expect(user.city).to.equal(addressUpdate.city.toUpperCase());
        expect(user.state).to.equal(addressUpdate.state);
        expect(updateSynapsepayTask).to.be.calledOnce;
        expect(user.zipCode).to.equal(addressUpdate.zipCode);
        expect(updateBrazeJobStub).to.be.calledOnce;
        expect(updateSynapsepayTask).to.be.calledOnce;
        expect(userUpdatedEventPublishStub).to.be.calledOnce;
        sinon.assert.calledWithExactly(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.USER_PROFILE_UPDATE,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: addressUpdate.addressLine1,
              city: addressUpdate.city,
              state: addressUpdate.state,
              zipCode: addressUpdate.zipCode,
            },
            modifications: {
              addressLine1: {
                previousValue: oldAddress.addressLine1,
                currentValue: addressUpdate.addressLine1.toUpperCase(),
              },
              addressLine2: {
                previousValue: oldAddress.addressLine2,
                currentValue: null,
              },
              city: {
                previousValue: oldAddress.city,
                currentValue: addressUpdate.city.toUpperCase(),
              },
              state: {
                previousValue: oldAddress.state,
                currentValue: addressUpdate.state,
              },
              zipCode: {
                previousValue: oldAddress.zipCode,
                currentValue: addressUpdate.zipCode,
              },
            },
          },
        });
      }),
    );

    it(
      'should format and correct address given valid address',
      replayHttp('v2/user/poorly-formatted-address.json', async () => {
        const oldAddress = {
          addressLine1: '1265 S Cochran Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
        };
        const user = await factory.create('user', oldAddress);
        const addressUpdate = {
          addressLine1: '3555 lAs VeGaS bLvD s',
          city: 'lv',
          state: 'nevada',
          zipCode: '89109',
        };
        await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(200);
        await user.reload();
        expect(user.addressLine1).to.equal(addressUpdate.addressLine1.toUpperCase());
        expect(user.addressLine2).not.to.exist;
        expect(user.city).to.equal('LAS VEGAS');
        expect(user.state).to.equal('NV');
        expect(user.zipCode).to.equal(addressUpdate.zipCode);
        sinon.assert.calledWith(auditLogStub, {
          userId: user.id,
          type: AuditLog.TYPES.USER_PROFILE_UPDATE,
          successful: true,
          extra: {
            requestPayload: {
              addressLine1: addressUpdate.addressLine1,
              city: addressUpdate.city,
              state: addressUpdate.state,
              zipCode: addressUpdate.zipCode,
            },
            modifications: {
              addressLine1: {
                previousValue: oldAddress.addressLine1,
                currentValue: addressUpdate.addressLine1.toUpperCase(),
              },
              city: {
                previousValue: oldAddress.city,
                currentValue: 'LAS VEGAS',
              },
              state: {
                previousValue: oldAddress.state,
                currentValue: 'NV',
              },
              zipCode: {
                previousValue: oldAddress.zipCode,
                currentValue: addressUpdate.zipCode,
              },
            },
          },
        });
        sinon.assert.calledWithExactly(updateSynapsepayTask, {
          userId: user.id,
          options: {
            fields: {
              addressLine1: user.addressLine1,
              addressLine2: undefined,
              city: user.city,
              state: user.state,
              zipCode: user.zipCode,
              firstName: undefined,
              lastName: undefined,
              birthdate: undefined,
              license: undefined,
            },
          },
        });
      }),
    );

    it(
      'returns 400 given invalid address',
      replayHttp('v2/user/invalid-address.json', async () => {
        const user = await factory.create('user');
        const invalidAddress = {
          addressLine1: 'blah blah blah',
          city: 'blah',
          state: 'blah',
          zipCode: 'blah',
        };
        sandbox.stub(console, 'error');
        const res = await request(app)
          .patch('/v2/user')
          .send(invalidAddress)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id);
        expect(res.status).to.equal(400);
        expect(res.body.message).to.match(/Undeliverable address/);
        expect(res.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS);
        expect(updateSynapsepayTask.notCalled).to.be.true;
        expect(auditLogStub.notCalled).to.be.true;
        expect(updateBrazeJobStub.notCalled).to.be.true;
      }),
    );

    it('returns 400 given incomplete address', async () => {
      const oldAddress = {
        addressLine1: '1265 S Cochran Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90019',
      };
      const user = await factory.create('user', { ...oldAddress });
      const addressUpdate = {
        addressLine1: '1277 S Cochran Ave',
        city: 'LA',
        state: 'california',
      };
      const res = await request(app)
        .patch('/v2/user')
        .send(addressUpdate)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);
      expect(res.status).to.equal(400);
      expect(res.body.message).to.match(/Incomplete address/);
      expect(res.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INCOMPLETE_ADDRESS);
    });

    it(
      'returns 400 given invalid banking signup address',
      replayHttp('v2/user/invalid-banking-address.json', async () => {
        const oldAddress = {
          addressLine1: '1265 S Cochran Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
        };
        const user = await factory.create('user', { ...oldAddress });
        const addressUpdate = {
          addressLine1: 'PO Box 123',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90019',
          isDaveBankingSignUp: true,
        };
        const res = await request(app)
          .patch('/v2/user')
          .send(addressUpdate)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id);

        expect(res.status).to.equal(400);
        expect(res.body.message).to.match(/The address cannot be a P.O. Box/);
        expect(res.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS);
      }),
    );

    it('should update the user settings without overriding existing values', async () => {
      const user = await factory.create('user', {
        settings: {
          default_tip: 5,
          push_notifications_enabled: true,
          sms_notifications_enabled: true,
        },
      });
      const result = await request(app)
        .patch('/v2/user')
        .send({ settings: { default_account: 'foobar' } })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
      expect(result.body.settings).to.be.an('object');
      expect(result.body.settings.default_tip).to.equal(5);
      expect(result.body.settings.default_account).to.equal('foobar');
      expect(updateBrazeJobStub.notCalled).to.be.true;
      expect(updateSynapsepayTask.notCalled).to.be.true;
      sinon.assert.calledWith(auditLogStub, {
        userId: user.id,
        type: AuditLog.TYPES.USER_PROFILE_UPDATE,
        successful: true,
        extra: {
          requestPayload: { settings: { default_account: 'foobar' } },
          modifications: {
            settings: {
              previousValue: {
                default_tip: 5,
                sms_notifications_enabled: true,
                push_notifications_enabled: true,
              },
              currentValue: {
                default_tip: 5,
                sms_notifications_enabled: true,
                push_notifications_enabled: true,
                default_account: 'foobar',
              },
            },
          },
        },
      });
    });

    it('should enqueue a background job to check user for fraud', async () => {
      const user = await factory.create<User>('user');
      sandbox.stub(sendgrid, 'send').resolves();
      await request(app)
        .patch('/v2/user')
        .send({ email: 'newEmail@dave.com' })
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      const jobArgs = fraudCheckJobStub.firstCall.args[0];
      expect(jobArgs).to.eql({ userId: user.id });
      sinon.assert.notCalled(updateSynapsepayTask);
    });

    it('should upload a profile picture', async () => {
      const user = await factory.create<User>('user');
      const url = 'http//myimage.com/asdfsadf';
      sandbox.stub(gcloudStorage, 'saveImageToGCloud').resolves(url);
      await request(app)
        .patch('/v2/user')
        .send({ profileImage: 'asdfsadf' })
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .expect(200);
      await user.reload();
      expect(user.profileImage).to.equal(url);
      expect(updateBrazeJobStub.notCalled).to.be.true;
    });

    it('should throw a 404 when attempting to set default bank that does not belong to user', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const user = await factory.create<User>('user', { id: bankAccount.userId + 1 });
      const result = await request(app)
        .patch('/v2/user')
        .send({ defaultBankAccountId: bankAccount.id })
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(result.status).to.equal(404);
    });

    it('should update bank connection primary bank account when updating users default bank account', async () => {
      const bankAccount = await factory.create<BankAccount>('checking-account');
      const user = await bankAccount.getUser();
      const syncUserDefaultBankAccountStub = sandbox.stub(
        BankingDataSync,
        'syncUserDefaultBankAccount',
      );

      const result = await request(app)
        .patch('/v2/user')
        .send({ defaultBankAccountId: bankAccount.id })
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      await user.reload();
      expect(result.status).to.equal(200);
      expect(user.defaultBankAccountId).to.equal(bankAccount.id);
      sinon.assert.calledOnce(syncUserDefaultBankAccountStub);
      expect(updateBrazeJobStub.notCalled).to.be.true;
    });
  });

  describe('PATCH /user', () => {
    beforeEach(() => up());
    it('should throw an error if email already exists', async () => {
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');
      const response = await request(app)
        .patch('/v2/user')
        .send({ email: '4@dave.com' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      sinon.assert.notCalled(emailVerificationHelperSpy);
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    });

    it('should send an email verification if email changed', async () => {
      const updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      const response = await request(app)
        .patch('/v2/user')
        .send({ email: '4a@dave.com' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(updateBrazeJobStub).to.be.calledWithExactly({
        userId: 500,
        attributes: { email_verified: false, unverified_email: '4a@dave.com' },
        eventProperties: {
          name: AnalyticsEvent.EmailUnverified,
          properties: {
            unverifiedEmail: '4a@dave.com',
            obfuscatedEmail: '4****a@dave.com',
            url: sinon.match.string,
            sendEmail: true,
          },
        },
      });

      expect(response.status).to.be.equal(200);
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .patch('/v2/user')
        .send({ email: 'brentmydland@dead.n et' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(response.status).to.be.equal(400);
      expect(response.body.message).to.match(/Please enter a valid email/);
    });
  });

  describe('PATCH /v2/user/name', () => {
    const birthdate = '1989-03-27';

    it('should throw an invalid parameters error if the file is not in the request body', async () => {
      const user = await factory.create('user', {
        firstName: 'Jessica',
        lastName: 'Smith',
      });
      const response = await request(app)
        .patch('/v2/user/name')
        .field({ firstName: 'Jeffrey', lastName: 'Lee', birthdate })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(400);

      expect(response.body.message).to.match(/No image provided/);
    });

    it('should throw an invalid parameters error if the firstName, lastName, or birthdate is not in the request body', async () => {
      const user = await factory.create('user', {
        firstName: 'Jessica',
        lastName: 'Smith',
      });
      const missingParamScenarios = [
        { firstName: 'Jeff', lastName: 'Lee' },
        { firstName: 'Jeff', birthdate },
        { lastName: 'Lee', birthdate },
        { firstName: 'Jeff' },
        { lastName: 'Lee' },
        { birthdate },
      ];
      for await (const scenario of missingParamScenarios) {
        const response = await request(app)
          .patch('/v2/user/name')
          .attach('image', 'test/fixtures/synapse-pay/passing-license.png')
          .field(scenario)
          .set('Authorization', user.id)
          .set('X-Device-Id', user.id)
          .expect(400);

        expect(response.body.message).to.match(
          /Required parameters not provided: birthdate, firstName, lastName/,
        );
      }
    });

    it('should throw an invalid parameters error if the birthdate is not in the request body', async () => {
      const firstName = 'Jessica';
      const lastName = 'Smith';
      const user = await factory.create('user', { firstName, lastName });

      const response = await request(app)
        .patch('/v2/user/name')
        .attach('image', 'test/fixtures/synapse-pay/passing-license.jpg')
        .field({ firstName, lastName })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(400);

      expect(response.body.message).to.match(
        /Required parameters not provided: birthdate, firstName, lastName/,
      );
    });

    it('should throw an invalid parameters error if file sent has invalid mimetype', async () => {
      const user = await factory.create('user', {
        firstName: 'Jessica',
        lastName: 'Smith',
      });

      const response = await request(app)
        .patch('/v2/user/name')
        .attach('image', 'test/fixtures/synapse-pay/GET-node.ts')
        .field({ firstName: 'Jeffrey', lastName: 'Lee', birthdate })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(400);

      expect(response.body.message).to.match(/Invalid image type/);
    });

    it('should validate birthdate', async () => {
      const user = await factory.create('user', {
        firstName: 'Jessica',
        lastName: 'Smith',
      });

      const response = await request(app)
        .patch('/v2/user/name')
        .attach('image', 'test/fixtures/synapse-pay/passing-license.png')
        .field({ firstName: 'Jeffrey', lastName: 'Lee', birthdate: 'the perfect date' })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(400);

      expect(response.body.message).to.match(/Invalid birthdate/);
    });

    it('should not allow bank of dave users to update name', async () => {
      const user = await factory.create('user', {
        firstName: 'Clyde',
        lastName: 'Cunningham',
      });
      await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });

      const response = await request(app)
        .patch('/v2/user/name')
        .attach('image', 'test/fixtures/synapse-pay/passing-license.png')
        .field({ firstName: 'Allie', lastName: 'Burke', birthdate: '1992-01-01' })
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .expect(403);

      expect(response.body.message).to.match(/Please contact Member Success/);
    });

    it(
      'should update the user first, last name, and birthdate',
      replayHttp('api/user/update-name-valid-license.json', async () => {
        const userId = 4546;
        const firstName = 'Jessica';
        const lastName = 'Smith';
        const synapseBirthDate = '2000-01-01';
        const user = await setupSynapsePayUser({
          userId,
          firstName,
          lastName,
          birthdate: synapseBirthDate,
        });
        const updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');

        const res = await request(app)
          .patch('/v2/user/name')
          .attach('image', 'test/fixtures/synapse-pay/passing-license.jpeg')
          .field({ firstName: 'Jeffrey', lastName: 'Lee', birthdate })
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);

        expect(res.status).to.equal(200);
        expect(res.body.firstName).to.equal('Jeffrey');
        expect(res.body.lastName).to.equal('Lee');
        expect(moment(res.body.birthdate)).to.be.sameMoment(
          moment(birthdate, MOMENT_FORMATS.YEAR_MONTH_DAY),
        );

        await user.reload();
        expect(user.firstName).to.be.eq('Jeffrey');
        expect(user.lastName).to.be.eq('Lee');
        expect(user.birthdate).to.be.sameMoment(moment(birthdate, MOMENT_FORMATS.YEAR_MONTH_DAY));

        const synapsepayDocument = await SynapsepayDocument.findOne({
          where: { userId: user.id },
          paranoid: false,
        });

        expect(synapsepayDocument.licenseStatus).to.exist;
        expect(synapsepayDocument.day).to.equal('27');
        expect(synapsepayDocument.month).to.equal('3');
        expect(updateBrazeJobStub).to.be.calledWithExactly({
          userId: user.id,
          attributes: {
            firstName: 'Jeffrey',
            lastName: 'Lee',
            birthdate: moment(birthdate, MOMENT_FORMATS.YEAR_MONTH_DAY).format(
              MOMENT_FORMATS.YEAR_MONTH_DAY,
            ),
          },
          eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
        });
      }),
    );
  });

  describe('DELETE /v2/user/:id', () => {
    let synapseDeleteAccountStub: sinon.SinonStub;
    beforeEach(() => {
      synapseDeleteAccountStub = sandbox.stub(SynapsepayNodeLib, 'deleteSynapsePayNode').resolves();
      sandbox.stub(recordEvent, 'publish').resolves();
      return up();
    });

    it('marks the user as deleted', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .send({
          reason: '$$$',
        })
        .expect(200);
      const user = await User.findByPk(3, { paranoid: false });
      expect(user.isSoftDeleted()).to.be.true;
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);
      expect(synapseDeleteAccountStub.calledOnce).to.equal(true);
    });

    it('adds a 60 day delete override on the deleted account if reason is Duplicate Account', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .send({
          reason: 'duplicate account',
        })
        .expect(200);
      const user = await User.findByPk(3, { paranoid: false });
      expect(user.isSoftDeleted()).to.be.true;
      expect(user.overrideSixtyDayDelete).to.equal(true);
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);
      expect(synapseDeleteAccountStub.calledOnce).to.equal(true);
    });

    it('adds a delete request entry for the user', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .send({
          reason: 'Too many bears',
          additionalInfo: 'Needs more cats',
        })
        .expect(200);

      const deleteRequest = await DeleteRequest.findOne({ where: { userId: 3 } });

      expect(deleteRequest.reason).to.equal('Too many bears');
      expect(deleteRequest.additionalInfo).to.equal('Needs more cats');
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);
    });

    it('creates an audit log entry', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .send({
          reason: 'Too many bears',
          additionalInfo: 'Needs more cats',
        })
        .expect(200);

      const log = await AuditLog.findAll({ where: { userId: 3 } });

      const deletedLog = log.find(x => x.type === 'USER_SOFT_DELETED');
      expect(deletedLog.type).to.equal('USER_SOFT_DELETED');
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);
      expect(synapseDeleteAccountStub.calledOnce).to.equal(true);
    });

    it('does not allow a user to delete another user', async () => {
      await request(app)
        .delete('/v2/user/4')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .expect(403);

      const user = await User.findByPk(3, { paranoid: false });

      expect(user.isSoftDeleted()).to.be.false;
    });

    it('does not require the user to provide a reason or additionalInfo', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .expect(200);
    });

    it('does not allow a user to delete when there are pending payments', async () => {
      const advance = await factory.create('advance', { outstanding: 0 });

      await Payment.create({
        advanceId: advance.id,
        userId: advance.userId,
        status: ExternalTransactionStatus.Pending,
        amount: advance.amount,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      const session = await factory.create('user-session', {
        userId: advance.userId,
      });

      await request(app)
        .delete(`/v2/user/${advance.userId}`)
        .set('X-Device-Id', session.deviceId)
        .set('Authorization', session.token)
        .send({
          reason: 'Too many bears',
          additionalInfo: 'Needs more cats',
        })
        .expect(409);

      const user = await User.findByPk(advance.userId, { paranoid: false });

      expect(user.isSoftDeleted()).to.be.false;
    });

    it('deos not allow a Dave Banking memeber to delete', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });

      const session = await factory.create('user-session', {
        userId: bankConnection.userId,
      });

      await request(app)
        .delete(`/v2/user/${bankConnection.userId}`)
        .set('X-Device-Id', session.deviceId)
        .set('Authorization', session.token)
        .send({
          reason: 'Too many bears',
          additionalInfo: 'Needs more cats',
        })
        .expect(409);

      const user = await User.findByPk(bankConnection.userId, { paranoid: false });

      expect(user.isSoftDeleted()).to.be.false;
    });

    it('marks the synapse pay document as deleted', async () => {
      await request(app)
        .delete('/v2/user/3')
        .set('X-Device-Id', 'id-3')
        .set('Authorization', 'token-3')
        .send({
          reason: '$$$',
        })
        .expect(200);
      const existingDocument = await SynapsepayDocument.findOne({
        where: { userId: 3 },
        paranoid: false,
      });
      expect(existingDocument.deleted).to.exist;
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);
      expect(synapseDeleteAccountStub.calledOnce).to.equal(true);
    });
  });

  describe('GET /v2/user/credentials/firebase', () => {
    beforeEach(() => up());

    it('should fail gracefully if the user is not logged in', async () => {
      const result = await request(app)
        .get('/v2/user/credentials/firebase')
        .set('Authorization', 'foo')
        .set('X-Device-Id', 'bar');

      expect(result.status).to.equal(401);
    });

    it('should get the firebase credentials', async () => {
      const token = { firebaseToken: 'token' };
      sandbox.stub(Firebase, 'getToken').resolves(token);
      const result = await request(app)
        .get('/v2/user/credentials/firebase')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(200);
      expect(result.body).to.deep.eq(token);
    });
  });

  describe('GET /v2/user/external_id', () => {
    it('should throw UnauthenticatedError if the user is not logged in', async () => {
      const response = await request(app)
        .get('/v2/user/external_id')
        .set('Authorization', 'foo')
        .set('X-Device-Id', 'bar');
      expect(response.status).to.equal(401);
    });

    it('should return user externalId', async () => {
      const user = await factory.create<User>('user');
      const response = await request(app)
        .get('/v2/user/external_id')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.body.externalId.length).to.equal(26);
    });
  });

  describe('PATCH /v2/user/set_email_password/:token', () => {
    const JWT_EXPIRATION: string = config.get('dave.jwt.expiration');

    it('should set the password field for the user but not send email verification', async () => {
      const user = await factory.create('user');
      const userSpy = sandbox.spy(User.prototype, 'setPassword');
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');

      const token = encode({ phoneNumber: user.phoneNumber });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!' });

      expect(result.status).to.equal(200);
      sinon.assert.notCalled(emailVerificationHelperSpy);
      sinon.assert.calledWith(userSpy.getCall(0), 'jeffsDaBest111!');
    });

    it('should set password and send email verification and send email verification', async () => {
      const user = await factory.create('user');
      const userSpy = sandbox.spy(User.prototype, 'setPassword');
      const broadcastEmailUnverifiedStub = sandbox.stub(
        UserUpdatesDomain,
        'broadcastEmailUnverified',
      );
      const token = encode({ phoneNumber: user.phoneNumber });
      sandbox.stub(Jobs, 'updateBrazeTask');

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!', email: 'someemail@gmail.com' });

      const log = await AuditLog.findOne({ where: { userId: user.id } });

      expect(result.status).to.equal(200);
      sinon.assert.calledOnce(broadcastEmailUnverifiedStub);
      sinon.assert.calledWith(userSpy.getCall(0), 'jeffsDaBest111!');
      expect(log.userId).to.equal(user.id);
      expect(log.type).to.equal('SET_EMAIL_PASSWORD');
      expect(log.message).to.equal('Successfully set email and/or password.');
      expect(log.extra.deviceId).to.be.undefined;
    });

    it('should set password with email encoded token', async () => {
      const user = await factory.create('user', { email: 'theAlpha@theOmega.com' });
      const userSpy = sandbox.spy(User.prototype, 'setPassword');
      const token = encode({ email: user.email });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!' });
      const log = await AuditLog.findOne({ where: { userId: user.id } });

      expect(result.status).to.equal(200);
      sinon.assert.calledWith(userSpy.getCall(0), 'jeffsDaBest111!');
      expect(log.userId).to.equal(user.id);
      expect(log.type).to.equal('SET_PASSWORD');
      expect(log.message).to.equal('Successfully set email and/or password.');
      expect(log.extra.deviceId).to.be.undefined;
    });

    it('should return an InvalidParametersError if password is missing', async () => {
      const token = encode({ phoneNumber: `1111111111` });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters not provided: password/);
    });

    it('should return an InvalidCredentialsError if there is no user found with this phone number', async () => {
      const user = await factory.create('user', { password: 'jeffsOldPassword' });
      const token = encode({ phoneNumber: `${user.phoneNumber}11111` });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!' });

      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/User was not found, please try again\./);
    });

    it('should return an InvalidCredentialsError if there is there is no active user with this email', async () => {
      const user = await factory.create('user', {
        email: 'someone@overtherainbow.com',
        password: 'jeffsOldPassword',
      });
      await user.destroy();
      const token = encode({ email: user.email });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!' });

      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/User was not found, please try again\./);
    });

    it('should throw an error if the token is expired', async () => {
      const user = await factory.create('user', { email: 'theAlpha@theOmega.com' });
      const timeNow: number = moment()
        .subtract(2, 'hour')
        .unix();
      const expiration = timeNow + JWT_EXPIRATION;
      const token = encode({ email: user.email, exp: expiration });

      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!' });

      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(
        /This link has expired. Please request an updated link and try again\./,
      );
    });

    it('should fail if email is invalid', async () => {
      const user = await factory.create('user');
      const token = encode({ phoneNumber: user.phoneNumber });
      const result = await request(app)
        .patch(`/v2/user/set_email_password/${token}`)
        .send({ password: 'jeffsDaBest111!', email: 'phillesh@dead .net' });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please enter a valid email/);
    });
  });

  // Hits the same function as the above endpoint, but
  describe('PATCH /v2/user/set_email_password', () => {
    beforeEach(() => up());
    it('should return an UnauthorizedError if no user is found', async () => {
      const result = await request(app)
        .patch(`/v2/user/set_email_password`)
        .send({ password: 'jeffsDaBest111!' })
        .set('Authorization', 'token-5000')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/No valid session was found for device_id id-500/);
    });

    it('should return successfully if user is found', async () => {
      const userSpy = sandbox.spy(User.prototype, 'setPassword');
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');

      const result = await request(app)
        .patch(`/v2/user/set_email_password`)
        .send({ password: 'jeffsDaBest111!' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(200);
      sinon.assert.notCalled(emailVerificationHelperSpy);
      sinon.assert.calledWith(userSpy.getCall(0), 'jeffsDaBest111!');
    });

    it('should fail if email is invalid', async () => {
      const result = await request(app)
        .patch(`/v2/user/set_email_password`)
        .send({ password: 'jeffsDaBest111!', email: 'phillesh@ dead.net' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please enter a valid email/);
    });
  });

  describe('POST /v2/user/login', () => {
    const appVersion = config.get<string>('minAppVersion.login');
    const ipLoginLimit = config.get<number>('rateLimits.loginsByIp.perHour');

    it('should throw InvalidParametersError password was provided but email was not', async () => {
      const result = await request(app)
        .post('/v2/user/login')
        .set('X-App-Version', appVersion)
        .send({ password: 'someThing123' });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(
        /Required parameters not provided: password and either email or phoneNumber\./,
      );
    });

    it(`should rate limit login after ${ipLoginLimit} attempts with the same ip`, async () => {
      const requests = await Promise.all(
        times(ipLoginLimit + 1, async n => {
          const user = await factory.create('user', { email: `ip-limit-test-${n}@dave.com` });
          return request(app)
            .post('/v2/user/login')
            .ok(res => [401, 200, 429].includes(res.status))
            .set('X-Device-Id', `${user.id}`)
            .set('X-Device-Type', `${user.id}`)
            .set('X-Forwarded-For', '192.168.2.1')
            .set('X-App-Version', appVersion)
            .send({ email: user.email, password: 'foo' });
        }),
      );

      const ratelimitedRequests = requests.filter(req => req.status === 429);
      expect(ratelimitedRequests.length).to.equal(1);
    });

    it(`should not rate limit login after ${ipLoginLimit} attempts with the same IP if they are on VPN and the server is in test or dev env`, async () => {
      const requests = await Promise.all(
        times(ipLoginLimit + 1, async n => {
          const user = await factory.create('user', { email: `ip-limit-test-${n}@dave.com` });
          return request(app)
            .post('/v2/user/login')
            .ok(res => [401, 200, 429].includes(res.status))
            .set('X-Device-Id', `${user.id}`)
            .set('X-Device-Type', `${user.id}`)
            .set('X-Forwarded-For', VPN_IP)
            .set('X-App-Version', appVersion)
            .send({ email: user.email, password: 'foo' });
        }),
      );

      const ratelimitedRequests = requests.filter(req => req.status === 429);
      expect(ratelimitedRequests.length).to.equal(0);
    });

    it('should rate limit login after 5 failed attempts with the same email', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });
      const bcryptStub = await sandbox.stub(bcrypt, 'compare').returns(false);
      const datadogStub = sandbox.stub(dogstatsd, 'increment');

      for (let i = 0; i < 5; i++) {
        const result1 = await request(app)
          .post('/v2/user/login')
          .set('X-Device-Id', 'bar1')
          .set('X-App-Version', appVersion)
          .set('X-Device-Type', 'ios')
          .set('X-Forwarded-For', `192.168.2.${i}`)
          .send({ email: user.email, password: 'wrong password' });
        expect(result1.status).to.equal(401);
        expect(result1.body.data.attemptsRemaining).to.equal(4 - i);
      }

      const result4 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar4')
        .set('X-App-Version', appVersion)
        .set('X-Device-Type', 'ios')
        .send({ email: user.email, password: 'wrong password' });
      expect(result4.status).to.equal(429);
      expect(result4.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');

      const result5 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar5')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: 'wrong password' });

      expect(result5.status).to.equal(429);
      expect(result5.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');
      expect(bcryptStub.callCount).to.eq(5);
    });

    it('should rate limit login after 5 failed attempts with the same phoneNumber', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });
      const bcryptStub = await sandbox.stub(bcrypt, 'compare').returns(false);
      const datadogStub = sandbox.stub(dogstatsd, 'increment');

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/v2/user/login')
          .set('X-Device-Id', `bar${i}`)
          .set('X-Device-Type', 'ios')
          .set('X-App-Version', appVersion)
          .set('X-Forwarded-For', `192.168.2.${i}`)
          .send({ phoneNumber: user.phoneNumber, password: 'wrong password' })
          .expect(401);
      }

      const result6 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar4')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password: 'wrong password' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');

      const result7 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar5')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password: 'wrong password' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');
      expect(bcryptStub.callCount).to.eq(5);
    });

    it('should rate limit login after 5 failed attempts with the same device ID', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/v2/user/login')
          .set('X-Device-Id', 'bar')
          .set('X-Device-Type', 'ios')
          .set('X-App-Version', appVersion)
          .set('X-Forwarded-For', `192.168.2.${i}`)
          .send({ email: 'jeff@jeff.com', password: 'jeffDaBest123!' })
          .expect(401);
      }

      const result6 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'jeff@jeff.com', password: 'jeffDaBest123!' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');

      const result7 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'jeff@jeff.com', password: 'jeffDaBest123!' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed login attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.login_with_credentials');
    });

    it('should throw InvalidCredentialsError if no active user is found with that email', async () => {
      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'jeff@jeff.com', password: 'jeffDaBest123!' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should throw InvalidCredentialsError if no active user is found with that phoneNumber', async () => {
      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: '1234564444', password: 'jeffDaBest123!' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should throw UnauthorizedError if user is flagged with fraud', async () => {
      const user = await factory.create('user', {
        email: 'jeffrey@lee.com',
        password: 'jeffDaBest',
        fraud: true,
      });

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: user.password });
      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(/Please contact Member Success/);
    });

    it('should throw InvalidCredentialsError if password does not match', async () => {
      const user = await factory.create('user', {
        email: 'jeffrey@lee.com',
        password: 'jeffDaBest',
      });

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: 'wrong password' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should throw InvalidCredentialsError if user has no password', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password: 'wrong password' });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_credentials');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(/Credentials provided are invalid\./);
    });

    it('should log in the user with email and password login', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: user.email, password });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
    });

    it('should log in the user with phoneNumber and password login', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
    });

    it('should ask for MFA login the user with phoneNumber and password login', async () => {
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);
      const user = await factory.create(
        'user',
        { email: 'jeffrey@lee.com' },
        { hasSession: false },
      );
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('mfa_required_for_login');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN);
      expect(deliverStub).to.have.callCount(1);

      const verification = await phoneNumberVerification.find(toE164(user.phoneNumber));
      const result2 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password, mfaCode: verification.code });
      expect(result2.status).to.equal(200);
      expect(result2.body).to.be.jsonSchema(userSchema);
    });

    it('should ask for MFA login the user with phoneNumber and password login and fail with wrong mfa code', async () => {
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);
      const user = await factory.create(
        'user',
        { email: 'jeffrey@lee.com' },
        { hasSession: false },
      );
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('mfa_required_for_login');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN);
      expect(deliverStub).to.have.callCount(1);

      const mfaCode = 123456;
      const result2 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password, mfaCode });
      expect(result2.status).to.equal(401);
      expect(result2.body.type).to.equal('invalid_code');
      expect(result2.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
    });

    it('should ask for MFA login the user with phoneNumber and password login and fail when provided a legacy mfa code', async () => {
      const deliverStub = sandbox.stub(phoneNumberVerification, 'deliver').resolves();
      sandbox
        .stub(config, 'get')
        .withArgs('rateLimits.loginsByIp.perHour')
        .returns(10)
        .withArgs('phoneNumbers.shouldSendVerificationCode')
        .returns(true);
      const user = await factory.create(
        'user',
        { email: 'jeffrey@lee.com' },
        { hasSession: false },
      );
      const password = 'jeffDaBest123!';
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar')
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password });
      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('mfa_required_for_login');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_MFA_REQUIRED_FOR_LOGIN);
      expect(deliverStub).to.have.callCount(1);

      const mfaCode = '1234';
      const result2 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', user.id)
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password, mfaCode });
      expect(result2.status).to.equal(400);
      expect(result2.body.message).to.contain(
        'Please download the latest version of Dave to continue.',
      );
    });

    it('should log in the user with phoneNumber and Password1 if admin override is set', async () => {
      const user = await factory.create('user', { email: 'jeffrey@lee.com' });
      await user.setPassword('jeffDaBest123!');
      await user.save();
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', uuid())
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ phoneNumber: user.phoneNumber, password: 'DaveSaves1111!' });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
    });

    it('should log the QA user in without prompting for MFA', async () => {
      const user = await factory.create('user', { email: 'qa@dave.com' });
      await user.setPassword('DaveSaves1111!');
      await user.save();

      const result = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', uuid())
        .set('X-Device-Type', 'ios')
        .set('X-App-Version', appVersion)
        .send({ email: 'qa@dave.com', password: 'DaveSaves1111!' });
      expect(result.status).to.equal(200);
      expect(result.body).to.be.jsonSchema(userSchema);
    });

    it('should not leak phone when logging in with email and incorrect password', async () => {
      const user = await factory.create('user', {
        email: 'walterkovacs@watchmen.com',
        phoneNumber: '+11234567890',
      });
      await sandbox.stub(bcrypt, 'compare').returns(false);
      sandbox.stub(dogstatsd, 'increment');

      const result1 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar1')
        .set('X-App-Version', appVersion)
        .set('X-Device-Type', 'ios')
        .set('X-Forwarded-For', `192.168.2.1`)
        .send({ email: user.email, password: 'wrong password' });
      expect(result1.status).to.equal(401);
      expect(result1.body.data.attemptsRemaining).to.equal(4);
      expect(result1.body.data.phoneNumber).to.be.undefined;
      expect(result1.body.data.email).to.be.undefined;
    });

    it('should not leak email when logging in with phone and incorrect password', async () => {
      const user = await factory.create('user', {
        email: 'walterkovacs@watchmen.com',
        phoneNumber: '+11234567890',
      });
      await sandbox.stub(bcrypt, 'compare').returns(false);
      sandbox.stub(dogstatsd, 'increment');

      const result1 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar1')
        .set('X-App-Version', appVersion)
        .set('X-Device-Type', 'ios')
        .set('X-Forwarded-For', `192.168.2.1`)
        .send({ phoneNumber: user.phoneNumber, password: 'wrong password' });
      expect(result1.status).to.equal(401);
      expect(result1.body.data.attemptsRemaining).to.equal(4);
      expect(result1.body.data.phoneNumber).to.be.undefined;
      expect(result1.body.data.email).to.be.undefined;
    });

    it('should not leak phone when logging in with email and correct password and wrong mfa', async () => {
      const user = await factory.create('user', {
        email: 'walterkovacs@watchmen.com',
        phoneNumber: '+17135551212',
      });
      await sandbox.stub(bcrypt, 'compare').returns(true);
      sandbox.stub(dogstatsd, 'increment');
      sandbox.stub(twilio, 'send').resolves();

      const result1 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar1')
        .set('X-App-Version', appVersion)
        .set('X-Device-Type', 'ios')
        .set('X-Forwarded-For', `192.168.2.1`)
        .send({ email: user.email, password: 'correct password', mfaCode: '999999' });
      expect(result1.status).to.equal(401);
      expect(result1.body.data.attemptsRemaining).to.equal(4);
      expect(result1.body.data.phoneNumber).to.be.undefined;
      expect(result1.body.data.email).to.be.undefined;
    });

    it('should not leak email when logging in with phone and correct password and wrong mfa', async () => {
      const user = await factory.create('user', {
        email: 'walterkovacs@watchmen.com',
        phoneNumber: '+17135551212',
      });
      await sandbox.stub(bcrypt, 'compare').returns(false);
      sandbox.stub(dogstatsd, 'increment');
      sandbox.stub(twilio, 'send').resolves();

      const result1 = await request(app)
        .post('/v2/user/login')
        .set('X-Device-Id', 'bar1')
        .set('X-App-Version', appVersion)
        .set('X-Device-Type', 'ios')
        .set('X-Forwarded-For', `192.168.2.1`)
        .send({ phoneNumber: user.phoneNumber, password: 'correct password', mfaCode: '999999' });
      expect(result1.status).to.equal(401);
      expect(result1.body.data.attemptsRemaining).to.equal(4);
      expect(result1.body.data.phoneNumber).to.be.undefined;
      expect(result1.body.data.email).to.be.undefined;
    });
  });

  describe('PATCH /v2/user/change_password', () => {
    beforeEach(() => up());
    const newPassword = 'jeffDaBest222!';
    const currentPassword = 'jeffDaBest111!';

    it('should fail gracefully if the user is not logged in', async () => {
      const result = await request(app)
        .patch('/v2/user/change_password')
        .set('Authorization', 'foo')
        .set('X-Device-Id', 'bar')
        .send({ newPassword, currentPassword });

      expect(result.status).to.equal(401);
    });

    it('fails gracefully if the user does not currently have a password', async () => {
      const user = await factory.create('user', { password: null });

      const result = await request(app)
        .patch('/v2/user/change_password')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ newPassword, currentPassword });

      expect(result.status).to.equal(409);
    });

    it('will return an InvalidParametersError if old or new password is not provided', async () => {
      const result = await request(app)
        .patch('/v2/user/change_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ newPassword });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(
        /Required parameters not provided: currentPassword, newPassword/,
      );
    });

    it('will return an InvalidCredentialsError if old password provided does not match the password on the user', async () => {
      const user = await User.findByPk(500);
      await user.setPassword(currentPassword);
      await user.save();

      const result = await request(app)
        .patch('/v2/user/change_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ newPassword, currentPassword: `${currentPassword}111111!` });

      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_password');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(
        /Password provided does not match what we have on record\./,
      );
    });

    it('will update the password on the user if old password matches with the password on the user', async () => {
      const user = await User.findByPk(500);
      await user.setPassword(currentPassword);
      await user.save();

      const userSpy = sandbox.spy(User.prototype, 'setPassword');
      const updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      const result = await request(app)
        .patch('/v2/user/change_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ newPassword, currentPassword });
      const log = await AuditLog.findOne({ where: { userId: user.id } });

      sinon.assert.calledWithExactly(userSpy, newPassword);
      expect(result.status).to.equal(200);
      expect(log.userId).to.equal(user.id);
      expect(log.type).to.equal('RESET_PASSWORD');
      expect(log.message).to.equal('Successfully reset password.');
      expect(log.extra.deviceId).to.equal('id-500');
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: 500,
        eventProperties: { name: AnalyticsEvent.PasswordUpdated },
      });
    });
  });

  describe('POST /v2/user/confirm_password', () => {
    beforeEach(() => up());
    it('should fail gracefully if the user is not logged in', async () => {
      const result = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'foo')
        .set('X-Device-Id', 'bar')
        .send({ password: 'insertGOT8Spoiler' });

      expect(result.status).to.equal(401);
    });

    it('will return a InvalidParametersError if password is not provided', async () => {
      const result = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters not provided: password/);
    });

    it('will return an InvalidCredentialsError if old password provided does not match the password on the user', async () => {
      const password = 'jeffDaBest111!';
      const user = await User.findByPk(500);
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ password: 'jonSnowKnowsNothing0' });

      expect(result.status).to.equal(401);
      expect(result.body.type).to.equal('invalid_password');
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
      expect(result.body.message).to.match(
        /Password provided does not match what we have on record\./,
      );
    });

    it('should rate limit confirm password after 5 failed attempts with the same deviceId', async () => {
      const password = 'jeffDaBest111!';
      const user = await User.findByPk(500);
      await user.setPassword(password);
      await user.save();
      const datadogStub = sandbox.stub(dogstatsd, 'increment');

      for (let i = 0; i < 5; i++) {
        const result = await request(app)
          .post('/v2/user/confirm_password')
          .set('Authorization', 'token-500')
          .set('X-Device-Id', 'id-500')
          .send({ password: 'jonSnowKnowsNothing0' });
        expect(result.status).to.equal(401);
      }

      const result6 = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ password: 'jonSnowKnowsNothing0' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed password confirmation attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.confirm_password');

      const result7 = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ password: 'jonSnowKnowsNothing0' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed password confirmation attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.confirm_password');
    });

    it('should rate limit confirm password after 5 failed attempts with the same phone number', async () => {
      const userId = 500;

      const password = 'jeffDaBest111!';
      const user = await User.findByPk(userId);
      await user.setPassword(password);
      await user.save();

      const userSession4 = await factory.create('user-session', { userId });
      const userSession5 = await factory.create('user-session', { userId });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');

      for (let i = 0; i < 5; i++) {
        const userSession = await factory.create('user-session', { userId });
        const result1 = await request(app)
          .post('/v2/user/confirm_password')
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId)
          .send({ password: 'jonSnowKnowsNothing0' });
        expect(result1.status).to.equal(401);
      }

      const result6 = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', userSession4.token)
        .set('X-Device-Id', userSession4.deviceId)
        .send({ password: 'jonSnowKnowsNothing0' });
      expect(result6.status).to.equal(429);
      expect(result6.body.message).to.match(
        /You've had too many failed password confirmation attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.confirm_password');

      const result7 = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', userSession5.token)
        .set('X-Device-Id', userSession5.deviceId)
        .send({ password: 'jonSnowKnowsNothing0' });
      expect(result7.status).to.equal(429);
      expect(result7.body.message).to.match(
        /You've had too many failed password confirmation attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.confirm_password');
    });

    it('will return a status 200 if password provided matches what is on the user', async () => {
      const password = 'jeffDaBest111!';
      const user = await User.findByPk(500);
      await user.setPassword(password);
      await user.save();

      const result = await request(app)
        .post('/v2/user/confirm_password')
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500')
        .send({ password });

      expect(result.status).to.equal(200);
    });
  });

  describe('POST /v2/user/reset_password', () => {
    const appVersion = config.get<string>('minAppVersion.resetPassword');
    const ip = '123.45.678.9';
    const deviceId = 'F5FG58RG678ERT345';
    let sendgridStub: sinon.SinonStub;

    beforeEach(() => (sendgridStub = sandbox.stub(sendgrid, 'send')));

    it('should return userId as null if there is no user found with provided email', async () => {
      const result = await request(app)
        .post('/v2/user/reset_password')
        .set('X-Forwarded-For', ip)
        .set('X-Device-Id', deviceId)
        .set('X-App-Version', appVersion)
        .send({ email: 'noUserWithThisEmail@gmail.com' });

      expect(result.status).to.be.equal(200);
      expect(result.body).to.eql({ userId: null, hasDaveBanking: false });
      expect(sendgridStub.notCalled).to.be.true;
    });

    it('should rate limit on ip', async () => {
      const requests = await Promise.all(
        times(4, async (n: number) =>
          request(app)
            .post('/v2/user/reset_password')
            .set('X-Forwarded-For', ip)
            .set('X-Device-Id', `${deviceId}${n}`)
            .set('X-App-Version', appVersion)
            .send({ email: 'validEmail@gmail.com' }),
        ),
      );
      const rateLimitCall = requests.filter(req => req.status === 429);
      expect(rateLimitCall.length).to.equal(1);
      expect(rateLimitCall[0].body.message).to.match(
        /Too many requests. Please try again in a few minutes/,
      );
      expect(sendgridStub.notCalled).to.be.true;
    });

    it('should rate limit on deviceId', async () => {
      const requests = await Promise.all(
        times(4, async (n: number) =>
          request(app)
            .post('/v2/user/reset_password')
            .set('X-Forwarded-For', `${ip}${n}`)
            .set('X-Device-Id', deviceId)
            .set('X-App-Version', appVersion)
            .send({ email: 'noUserWithThisEmail@gmail.com' }),
        ),
      );
      const rateLimitCalls = requests.filter(req => req.status === 429);
      expect(rateLimitCalls.length).to.equal(1);
      expect(rateLimitCalls[0].body.message).to.match(
        /Too many requests. Please try again in a few minutes/,
      );
      expect(sendgridStub.notCalled).to.be.true;
    });

    it('should rate limit on userId when available', async () => {
      const email = 'thisIsAnEmail@gmail.com';
      await factory.create<User>('user', { email });
      const requests = await Promise.all(
        times(4, async (n: number) =>
          request(app)
            .post('/v2/user/reset_password')
            .set('X-Forwarded-For', `${ip}${n}`)
            .set('X-Device-Id', `${deviceId}${n}`)
            .set('X-App-Version', appVersion)
            .send({ email }),
        ),
      );
      const rateLimitCalls = requests.filter(req => req.status === 429);
      expect(rateLimitCalls.length).to.equal(1);
      expect(rateLimitCalls[0].body.message).to.match(
        /Too many requests. Please try again in a few minutes/,
      );
    });

    context('non Dave Banking users', () => {
      it('should send reset password email and set hasDaveBanking to false given email', async () => {
        const email = 'fakeEmail@email.com';
        const user = await factory.create<User>('user', { email });
        const result = await request(app)
          .post('/v2/user/reset_password')
          .set('X-Forwarded-For', ip)
          .set('X-Device-Id', deviceId)
          .set('X-App-Version', appVersion)
          .send({ email });

        expect(result.status).to.be.equal(200);
        expect(result.body.userId).to.be.equal(user.id);
        expect(result.body.hasDaveBanking).to.be.false;
        expect(sendgridStub).to.be.calledOnce;
      });

      it('should send reset password email and set hasDaveBanking to false for given phone number', async () => {
        const user = await factory.create<User>('user', { email: 'someEmail' });
        const result = await request(app)
          .post('/v2/user/reset_password')
          .set('X-Forwarded-For', ip)
          .set('X-Device-Id', deviceId)
          .set('X-App-Version', appVersion)
          .send({ phoneNumber: user.phoneNumber.replace(/\+1/, '') });

        expect(result.status).to.be.equal(200);
        expect(result.body.userId).to.be.equal(user.id);
        expect(result.body.hasDaveBanking).to.be.false;
        expect(sendgridStub).to.be.calledOnce;
      });
    });

    context('Dave Banking users', () => {
      it('should not send email and set hasDaveBanking to true given email', async () => {
        const email = 'fakeEmail@email.com';
        const user = await factory.create<User>('user', { email });
        await factory.create('bank-connection', {
          userId: user.id,
          bankingDataSource: BankingDataSource.BankOfDave,
        });
        const result = await request(app)
          .post('/v2/user/reset_password')
          .set('X-Forwarded-For', ip)
          .set('X-Device-Id', deviceId)
          .set('X-App-Version', appVersion)
          .send({ email });

        expect(result.status).to.be.equal(200);
        expect(result.body.userId).to.be.equal(user.id);
        expect(result.body.hasDaveBanking).to.be.true;
        expect(sendgridStub.notCalled).to.be.true;
      });

      it('should not send email and set hasDaveBanking to true given phone number', async () => {
        const user = await factory.create<User>('user', { email: 'fakeEmail@email.com' });
        await factory.create('bank-connection', {
          userId: user.id,
          bankingDataSource: BankingDataSource.BankOfDave,
        });
        const result = await request(app)
          .post('/v2/user/reset_password')
          .set('X-Forwarded-For', ip)
          .set('X-Device-Id', deviceId)
          .set('X-App-Version', appVersion)
          .send({ phoneNumber: user.phoneNumber.replace(/\+1/, '') });

        expect(result.status).to.be.equal(200);
        expect(result.body.userId).to.be.equal(user.id);
        expect(result.body.hasDaveBanking).to.be.true;
        expect(sendgridStub.notCalled).to.be.true;
      });
    });
  });

  describe('POST /v2/user/dave_banking/identity_verification', async () => {
    const minAppVersion = config.get<string>('minAppVersion.identityVerification');
    it('should fail if the version is below minAppVersion', async () => {
      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', '2.16.0')
        .send({ userId: 0, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      expect(response.status).to.equal(400);
    });

    it('should send MFA by phone and return a phone number and a token if successful', async () => {
      const user = await factory.create('user', { email: 'allison@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      sandbox.stub(DaveBankingClient, 'verifyUser').resolves({});
      const twilioStub = sandbox.stub(twilio, 'send').resolves();

      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234' });
      expect(response.body.phoneNumber).to.be.eq(user.phoneNumber);
      expect(response.body.token).to.exist;
      const decodedToken = decode(response.body.token);
      expect(decodedToken.userId).to.be.eq(user.id);
      sinon.assert.calledOnce(twilioStub);
    });

    it('should send MFA by email and return a phone number and a token if successful', async () => {
      const user = await factory.create('user', { email: 'allison@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      sandbox.stub(DaveBankingClient, 'verifyUser').resolves({});
      const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();

      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      expect(response.body.phoneNumber).to.be.eq(user.phoneNumber);
      expect(response.body.token).to.exist;
      const decodedToken = decode(response.body.token);
      expect(decodedToken.userId).to.be.eq(user.id);
      sinon.assert.calledOnce(sendgridStub);
    });

    it('should throw a InvalidCredentialsError if SSN verifies unsuccessfully', async () => {
      const user = await factory.create('user', { email: 'allison@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      sandbox.stub(DaveBankingClient, 'verifyUser').throws(new Error());

      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      expect(response.status).to.equal(401);
      expect(response.body.message).to.match(/Dave couldn't verify your SSN. Mind trying again\?/);
    });

    it('it should throw a NotFoundError if no user could be found with user id', async () => {
      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: 0, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      expect(response.status).to.equal(404);
      expect(response.body.message).to.match(/User was not found, please try again\./);
    });

    it('it should throw a RateLimitError if this endpoint was called more than 5 times', async () => {
      const user = await factory.create('user', { email: 'allison@dave.com' });
      await factory.create('bank-of-dave-bank-connection', { userId: user.id });
      sandbox.stub(sendgrid, 'send').resolves();

      await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      const response = await request(app)
        .post('/v2/user/dave_banking/identity_verification')
        .set('X-App-Version', minAppVersion)
        .send({ userId: user.id, ssnLast4: '1234', recoveryEmail: 'allison@dave.com' });
      expect(response.status).to.equal(429);
      expect(response.body.message).to.match(
        /You\'ve had too many verify SSN attempts\. Please try again in a few minutes\./,
      );
    });
  });

  describe('POST /v2/user/reset_password/dave_banking/verify_code', () => {
    const ip = '275.737.57.280';
    const endpoint = '/v2/user/reset_password/dave_banking/verify_code';
    const deviceId = '439SGFFDFE85340894208ASDE3S';
    const JWT_EXPIRATION: number = config.get(
      'resetPassword.daveBanking.userHasVerfiedSSN.jwt.expiration',
    );

    function createToken(id: string): string {
      const exp = moment().unix() + JWT_EXPIRATION;
      return encode({ userId: id, exp });
    }

    it('should throw an InvalidParametersError if code is missing', async () => {
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ userId: '111111' });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters not provided: code, token/);
    });

    it('should throw an InvalidParametersError if token is missing', async () => {
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ code: '123456' });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters not provided: code, token/);
    });

    it('should throw an InvalidCredentialsError if the token is invalid', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ token: 'invalid token', code: '123456' });
      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/Request timed out/);
      expect(result.body.customCode).to.equal(206);
      expect(datadogStub).calledWithExactly(
        'user.reset_password.bank.verify_code.token_decode_failed',
      );
    });

    it('should throw an InvalidCredentialsError if token is expired', async () => {
      const userId = 12345;
      const exp =
        moment()
          .subtract(1, 'hour')
          .unix() + JWT_EXPIRATION;
      const token = encode({ userId, exp });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ token, code: '123456' });
      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/Request timed out/);
      expect(result.body.customCode).to.equal(206);
      expect(datadogStub).calledWithExactly('user.reset_password.bank.verify_code.token_expired');
    });

    it('should return an error if userId is not associated with a user', async () => {
      const token = createToken('not a user id');
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ token, code: '123456' });
      expect(result.status).to.equal(404);
      expect(result.body.message).to.match(/Cannot find user with id/);
    });

    it('should rate limit on ip', async () => {
      const requests = await Promise.all(
        times(4, async (n: number) => {
          const user = await factory.create('user');
          const token = createToken(user.id);
          return request(app)
            .post(endpoint)
            .set('X-Forwarded-For', ip)
            .set('X-Device-Id', `${deviceId}${n}`)
            .send({ token, code: '123456' });
        }),
      );
      const rateLimitCalls = requests.filter(req => req.status === 429);
      expect(rateLimitCalls.length).to.equal(1);
      expect(rateLimitCalls[0].body.message).to.match(
        /You\'ve had too many failed code verification attempts. Please try again in a few minutes/,
      );
    });

    it('should rate limit on device id', async () => {
      const requests = await Promise.all(
        times(4, async (n: number) => {
          const user = await factory.create('user');
          const token = createToken(user.id);
          return request(app)
            .post(endpoint)
            .set('X-Forwarded-For', `${ip}${n}`)
            .set('X-Device-Id', deviceId)
            .send({ token, code: '123456' });
        }),
      );
      const rateLimitCalls = requests.filter(req => req.status === 429);
      expect(rateLimitCalls.length).to.equal(1);
      expect(rateLimitCalls[0].body.message).to.match(
        /You\'ve had too many failed code verification attempts. Please try again in a few minutes/,
      );
    });

    it('should rate limit on user id', async () => {
      const user = await factory.create('user');
      const token = createToken(user.id);
      const requests = await Promise.all(
        times(4, async (n: number) => {
          return request(app)
            .post(endpoint)
            .set('X-Forwarded-For', `${ip}${n}`)
            .set('X-Device-Id', `${deviceId}${n}`)
            .send({ token, code: '123456' });
        }),
      );
      const rateLimitCalls = requests.filter(req => req.status === 429);
      expect(rateLimitCalls.length).to.equal(1);
      expect(rateLimitCalls[0].body.message).to.match(
        /You\'ve had too many failed code verification attempts. Please try again in a few minutes/,
      );
    });

    it('should return an error if user does not have Dave Banking', async () => {
      const user = await factory.create('user');
      const token = createToken(user.id);
      const result = await request(app)
        .post(endpoint)
        .set('X-Device-Id', deviceId)
        .set('X-Forwarded-For', ip)
        .send({ token, code: '123456' });
      expect(result.status).to.equal(404);
      expect(result.body.message).to.match(/Cannot find Dave Banking user with id/);
    });

    context('tests that require Dave banking connection', () => {
      let userId: string;
      let token: string;

      beforeEach(async () => {
        const bc = await factory.create('bank-of-dave-bank-connection');
        userId = bc.userId;
        token = createToken(userId);
      });

      it('should return an error if verification code is invalid', async () => {
        const result = await request(app)
          .post(endpoint)
          .set('X-Device-Id', deviceId)
          .set('X-Forwarded-For', ip)
          .send({ token, code: '123456' });
        expect(result.status).to.equal(401);
        expect(result.body.message).to.match(/Verification code is invalid/);
        expect(result.body.customCode).to.equal(200);
      });

      it('should throw an InvalidParametersError if code is not a 6 digit string', async () => {
        const result = await request(app)
          .post(endpoint)
          .set('X-Device-Id', deviceId)
          .set('X-Forwarded-For', ip)
          .send({ token, code: '1234567890' });
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/Invalid verification code/);
      });

      it('should throw an InvalidParametersError if code is a 4 digit legacy mfa code', async () => {
        const result = await request(app)
          .post(endpoint)
          .set('X-Device-Id', deviceId)
          .set('X-Forwarded-For', ip)
          .send({ token, code: '1234' });
        expect(result.status).to.equal(400);
        expect(result.body.message).to.contain(
          'Please download the latest version of Dave to continue.',
        );
      });

      it('should return an error if sendgrid email fails', async () => {
        const code = '857575';
        const user = await User.findByPk(userId);
        await createVerificationCode({ phoneNumber: toE164(user.phoneNumber), code });
        sandbox.stub(sendgrid, 'send').throws();
        const result = await request(app)
          .post(endpoint)
          .set('X-Device-Id', deviceId)
          .set('X-Forwarded-For', ip)
          .send({ token, code });
        expect(result.status).to.equal(502);
        expect(result.body.message).to.match(
          /Something went wrong when sending your password reset email. Please try again/,
        );
      });

      it('should return 200 on success', async () => {
        const code = '857575';
        const user = await User.findByPk(userId);
        await createVerificationCode({ phoneNumber: toE164(user.phoneNumber), code });
        const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
        const result = await request(app)
          .post(endpoint)
          .set('X-Device-Id', deviceId)
          .set('X-Forwarded-For', ip)
          .send({ token, code });
        expect(result.status).to.equal(200);
        expect(sendgridStub).to.be.calledOnce;
      });
    });
  });

  describe('POST /v2/user/send_reset_password_email', () => {
    it('should return an error asking the user to update their app', async () => {
      const res = await request(app)
        .post('/v2/user/send_reset_password_email')
        .set('X-App-Version', '2.14.8')
        .send({ email: 'someEmail' });
      expect(res.body.message).to.match(
        /Please update to the latest version of Dave to reset your password/,
      );
    });
  });

  describe('POST /v2/user/send_verification', () => {
    const appVersion = config.get<string>('minAppVersion.login');
    const phoneNumber = '1234567890';

    it('should fail if the phone number is not provided', async () => {
      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please enter a valid phone number/);
    });

    it('should ignore numCodeDigits since it is deprecated', async () => {
      const sendStub = sandbox.stub(twilio, 'send').resolves();

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber, numCodeDigits: 'invalid' });

      expect(result.status).to.equal(200);
      expect(sendStub.callCount).to.eq(1);
    });

    it('should fail if the phone number is invalid', async () => {
      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber: 'blahblah' });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please enter a valid phone number/);
    });

    it('should fail if the phone number is voip', async function() {
      this.mobileStub.resolves({ isMobile: false });

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/gotta use your real number/);
    });

    it('should fail if Twilio errors', async () => {
      sandbox.stub(twilio, 'send').rejects(new NotSupportedError());

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber, verificationCodeOnly: true });
      expect(result.status).to.equal(405);
    });

    it('should fail if user has unsubscribed from sms messages', async () => {
      const user = await factory.create<User>('user', { unsubscribed: true });

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber: user.phoneNumber });

      expect(result.status).to.equal(403);
      expect(result.body.customCode).to.equal(201);
    });

    it('should send verification code to existing user and return 200 when successful', async () => {
      const user = await factory.create<User>('user');
      const sendStub = sandbox.stub(twilio, 'send').resolves();

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber: user.phoneNumber });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.empty;
      expect(sendStub).to.have.callCount(1);
    });

    it('should send verification code to new user and return 200 when successful', async () => {
      const sendStub = sandbox.stub(twilio, 'send').resolves();

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.empty;
      expect(sendStub).to.have.callCount(1);
    });

    it('should send verification code to new user (with email) and return 200 when successful', async () => {
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();

      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber, email: 'user@dave.com' });

      expect(result.status).to.equal(200);
      expect(result.body).to.be.empty;
      expect(sendStub).to.have.callCount(1);
    });

    it('should fail if email is not the users email', async () => {
      const user = await factory.create('user');
      const result = await request(app)
        .post('/v2/user/send_verification')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber: user.phoneNumber, email: 'tswiftfan@gmnail.com' });

      expect(result.status).to.equal(401);
    });

    context('deleted accounts', () => {
      it('should fail when account deleted <60 days with no admin override', async () => {
        const deletedTimestamp = moment().subtract(1, 'month');

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
        });
        const result = await request(app)
          .post('/v2/user/send_verification')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should return verificationInfo when account deleted <60 days but has admin override', async () => {
        const deletedTimestamp = moment().subtract(1, 'month');

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
          overrideSixtyDayDelete: true,
        });
        sandbox.stub(twilio, 'send').resolves();
        sandbox.stub(sendgrid, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/send_verification')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });
        expect(result.status).to.equal(200);
        expect(result.body).to.be.empty;
      });

      it('should send verification code if the user deleted their account >60 days ago', async () => {
        const deletedTimestamp = moment().subtract(3, 'months');
        const sendStub = sandbox.stub(twilio, 'send').resolves();

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
        });
        const result = await request(app)
          .post('/v2/user/send_verification')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(200);
        expect(result.body).to.be.empty;
        expect(sendStub).to.have.callCount(1);
      });

      it('should fail if a user had an override but deleted their account a second time', async () => {
        const firstCreatedTimestamp = moment().subtract(5, 'months');
        const firstDeletedTimestamp = moment().subtract(3, 'months');
        const secondCreatedTimestamp = moment().subtract(2, 'months');
        const secondDeletedTimestamp = moment().subtract(2, 'weeks');

        await Promise.all([
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-1`,
            created: firstCreatedTimestamp,
            deleted: firstDeletedTimestamp,
            overrideSixtyDayDelete: true,
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-2`,
            created: secondCreatedTimestamp,
            deleted: secondDeletedTimestamp,
          }),
        ]);

        const result = await request(app)
          .post('/v2/user/send_verification')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should send verification code if user has email, no password, and a history of deleted accounts', async () => {
        const firstCreatedTimestamp = moment().subtract(8, 'months');
        const firstDeletedTimestamp = moment().subtract(7, 'months');
        const secondCreatedTimestamp = moment().subtract(6, 'months');
        const secondDeletedTimestamp = moment().subtract(5, 'weeks');
        const thirdCreatedTimestamp = moment().subtract(4, 'months');
        const thirdDeletedTimestamp = moment().subtract(3, 'months');

        await Promise.all([
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-1`,
            created: firstCreatedTimestamp,
            deleted: firstDeletedTimestamp,
            overrideSixtyDayDelete: true,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-2`,
            created: secondCreatedTimestamp,
            deleted: secondDeletedTimestamp,
            overrideSixtyDayDelete: true,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-3`,
            created: thirdCreatedTimestamp,
            deleted: thirdDeletedTimestamp,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}`,
            email: 'user@dave.com',
          }),
        ]);
        const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/send_verification')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(200);
        expect(result.body).to.be.empty;
        expect(sendStub).to.have.callCount(1);
      });
    });
  });

  describe('POST /v2/user/verify_code', () => {
    beforeEach(() => up());
    it('should throw an InvalidParametersError if the phone number or code is missing', async () => {
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber: '+11234567890' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Required parameters not provided: phoneNumber, code/);
    });

    it('should return a 400 if the code provided is a legacy 4 digit mfa code', async () => {
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber: '+11234567890', code: '1234' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain(
        'Please download the latest version of Dave to continue.',
      );
    });

    it('should rate limit after 5 failed attempts at verification', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/v2/user/verify_code')
          .send({ phoneNumber: '+11234567890', code: '123456' })
          .set('Authorization', 'token-500')
          .set('X-Device-Id', 'id-500')
          .expect(401);
      }

      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber: '+11234567890', code: '123456' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(result.status).to.equal(429);
      expect(result.body.message).to.match(
        /You've had too many failed code verification attempts. Please try again in a few minutes\./,
      );
      expect(datadogStub).calledWithExactly('rate_limit_error.verify_code');
    });

    it("should throw an InvalidCredentialsError if the code provided doesn't match up", async () => {
      await createVerificationCode({ phoneNumber: '+11234567890', code: '000000' });
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber: '+11234567890', code: '123456' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/Verification code is invalid/);
    });

    it('should return a successful response with a token if the code matches', async () => {
      await createVerificationCode({ phoneNumber: '+11234567890', code: '123456' });
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber: '+11234567890', code: '123456' })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');

      expect(result.status).to.equal(200);
      expect(result.body.token).to.exist;
    });

    it('should return a successful response with a token if an admin override code matches', async () => {
      const phoneNumber = '+11234567890';
      const adminLoginOverride = await UserHelper.setAdminLoginOverride(phoneNumber);
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber, code: adminLoginOverride.pin.toString() })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(result.status).to.equal(200);
      expect(result.body.token).to.exist;
    });

    it('should throw an InvalidCredentialsError if an admin override code does not match', async () => {
      const phoneNumber = '+11234567890';
      const adminLoginOverride = await UserHelper.setAdminLoginOverride(phoneNumber);
      const result = await request(app)
        .post('/v2/user/verify_code')
        .send({ phoneNumber, code: (adminLoginOverride.pin + 1).toString() })
        .set('Authorization', 'token-500')
        .set('X-Device-Id', 'id-500');
      expect(result.status).to.equal(401);
      expect(result.body.message).to.match(/Verification code is invalid/);
    });
  });

  describe('POST /v2/user/verify_number', () => {
    const appVersion = '2.12.9';

    it('should return return {isNewUser: true} if user is new', async () => {
      const result = await request(app)
        .post('/v2/user/verify_number')
        .set('X-App-Version', appVersion)
        .set('X-Device-Id', uuid.v4())
        .send({ phoneNumber: '2229994444' });

      expect(result.status).to.equal(200);
      expect(result.body.isNewUser).to.be.true;
    });

    context('deleted accounts', () => {
      it('should fail when account deleted <60 days with no admin override', async () => {
        const deletedTimestamp = moment().subtract(1, 'month');
        const phoneNumber = '6505551212';

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
        });
        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should return verificationInfo when account deleted <60 days but has admin override', async () => {
        const deletedTimestamp = moment().subtract(1, 'month');
        const phoneNumber = '6505551212';

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
          overrideSixtyDayDelete: true,
        });
        sandbox.stub(twilio, 'send').resolves();
        sandbox.stub(sendgrid, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });
        expect(result.status).to.equal(200);
        expect(result.body.isNewUser).to.be.true;
      });

      it('should return verificationInfo if the user deleted their account >60 days ago', async () => {
        const deletedTimestamp = moment().subtract(3, 'months');
        const phoneNumber = '6505551212';

        await factory.create<User>('user', {
          phoneNumber: `+1${phoneNumber}-deleted-`,
          deleted: deletedTimestamp,
        });
        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(200);
        expect(result.body.isNewUser).to.be.true;
      });

      it('should fail if a user had an override but deleted their account a second time', async () => {
        const firstCreatedTimestamp = moment().subtract(5, 'months');
        const firstDeletedTimestamp = moment().subtract(3, 'months');
        const secondCreatedTimestamp = moment().subtract(2, 'months');
        const secondDeletedTimestamp = moment().subtract(2, 'weeks');
        const phoneNumber = '6505551212';

        await Promise.all([
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-1`,
            created: firstCreatedTimestamp,
            deleted: firstDeletedTimestamp,
            overrideSixtyDayDelete: true,
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-2`,
            created: secondCreatedTimestamp,
            deleted: secondDeletedTimestamp,
          }),
        ]);

        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(403);
        expect(result.body.customCode).to.equal(202);
        expect(result.body.data.daysRemaining).to.be.a('number');
      });

      it('should return verificationInfo if user has email, no password, and a history of deleted accounts', async () => {
        const firstCreatedTimestamp = moment().subtract(8, 'months');
        const firstDeletedTimestamp = moment().subtract(7, 'months');
        const secondCreatedTimestamp = moment().subtract(6, 'months');
        const secondDeletedTimestamp = moment().subtract(5, 'weeks');
        const thirdCreatedTimestamp = moment().subtract(4, 'months');
        const thirdDeletedTimestamp = moment().subtract(3, 'months');
        const phoneNumber = '6505551213';

        await Promise.all([
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-1`,
            created: firstCreatedTimestamp,
            deleted: firstDeletedTimestamp,
            overrideSixtyDayDelete: true,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-2`,
            created: secondCreatedTimestamp,
            deleted: secondDeletedTimestamp,
            overrideSixtyDayDelete: true,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}-deleted-3`,
            created: thirdCreatedTimestamp,
            deleted: thirdDeletedTimestamp,
            email: 'user@dave.com',
          }),
          factory.create<User>('user', {
            phoneNumber: `+1${phoneNumber}`,
            email: 'user@dave.com',
          }),
        ]);
        const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();

        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber });

        expect(result.status).to.equal(200);
        expect(result.body.hasProvidedEmailAddress).to.be.true;
        expect(result.body.hasCreatedPassword).to.be.false;
        expect(result.body.email).to.eq('u****r@dave.com');
        expect(sendgridStub).to.have.callCount(1);
      });
    });

    context('errors', () => {
      const ip = '123.45.678.9';
      const deviceId = 'F5FG58RG678ERT345';
      const phoneNumber = '0009998888';

      it('should fail if the phone number was not provided', async () => {
        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({});
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not provided: phoneNumber/);
      });

      it('should fail if the phone number provided is invalid', async () => {
        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber: 'foobar' });
        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/not seem to be a phone number/);
      });

      it('should rate limit on ip', async () => {
        const requests = await Promise.all(
          times(6, async (n: number) =>
            request(app)
              .post('/v2/user/verify_number')
              .set('X-Forwarded-For', ip)
              .set('X-Device-Id', `${deviceId}${n}`)
              .set('X-App-Version', appVersion)
              .send({ phoneNumber: `${phoneNumber}${n}` }),
          ),
        );
        const rateLimitCall = requests.filter(req => req.status === 429);
        expect(rateLimitCall.length).to.equal(1);
        expect(rateLimitCall[0].body.message).to.match(
          /Too many requests. Please try again in a few minutes/,
        );
      });

      it('should rate limit on deviceId', async () => {
        const requests = await Promise.all(
          times(6, async (n: number) =>
            request(app)
              .post('/v2/user/verify_number')
              .set('X-Forwarded-For', `${ip}${n}`)
              .set('X-Device-Id', deviceId)
              .set('X-App-Version', appVersion)
              .send({ phoneNumber: `${phoneNumber}${n}` }),
          ),
        );
        const rateLimitCalls = requests.filter(req => req.status === 429);
        expect(rateLimitCalls.length).to.equal(1);
        expect(rateLimitCalls[0].body.message).to.match(
          /Too many requests. Please try again in a few minutes/,
        );
      });

      it('should rate limit on phoneNumber', async () => {
        const requests = await Promise.all(
          times(6, async (n: number) =>
            request(app)
              .post('/v2/user/verify_number')
              .set('X-Forwarded-For', `${ip}${n}`)
              .set('X-Device-Id', `${deviceId}${n}`)
              .set('X-App-Version', appVersion)
              .send({ phoneNumber }),
          ),
        );
        const rateLimitCalls = requests.filter(req => req.status === 429);
        expect(rateLimitCalls.length).to.equal(1);
        expect(rateLimitCalls[0].body.message).to.match(
          /Too many requests. Please try again in a few minutes/,
        );
      });

      it('should handle Twilio contract change errors', async () => {
        const user = await factory.create<User>('user');
        sandbox
          .stub(twilio, 'checkForContractChange')
          .rejects(new TwilioError('TCPA compliance check failed'));
        sandbox.stub(twilio, 'send').resolves();
        const result = await request(app)
          .post('/v2/user/verify_number')
          .set('X-App-Version', appVersion)
          .set('X-Device-Id', uuid.v4())
          .send({ phoneNumber: user.phoneNumber });

        expect(result.status).to.equal(200);
      });
    });
  });

  describe('POST /v2/user/covid_19_jobloss', () => {
    it('should redeem COVID-19 jobloss billing relief', async () => {
      const brazeStub = sandbox.stub(braze, 'track');
      const user = await factory.create('user');
      await factory.create('subscription-billing', { userId: user.id });
      const session = await factory.create('user-session', {
        userId: user.id,
      });

      const covid19Relief = await factory.create('subscription-billing-promotion', {
        code: 'COVID_19_JOBLOSS',
        months: 2,
      });

      const result = await request(app)
        .post(`/v2/user/covid_19_jobloss`)
        .set('X-Device-Id', session.deviceId)
        .set('X-Device-Type', session.deviceType)
        .set('Authorization', session.token)
        .send();

      expect(result.status).to.equal(200);

      const redeemed = await RedeemedSubscriptionBillingPromotion.findOne({
        where: { userId: user.id },
      });
      expect(brazeStub.firstCall).to.be.calledWith({
        events: [
          sinon.match({
            name: 'free month earned',
            externalId: String(user.id),
            properties: sinon.match({
              source: 'COVID_19_JOBLOSS',
              sourceType: 'Promotion',
            }),
          }),
        ],
      });
      expect(brazeStub.secondCall).to.be.calledWith({
        events: [sinon.match({ name: 'COVID-19 jobloss', externalId: String(user.id) })],
      });
      expect(redeemed).to.exist;
      expect(redeemed.subscriptionBillingPromotionId).to.equal(covid19Relief.id);
    });
  });

  describe('POST /v2/user/verify_address', () => {
    let user: User;

    beforeEach(async () => {
      user = await factory.create('user');
    });

    it('should return an address if the the address is valid and verified', async () => {
      const address = {
        addressLine1: '411 S Virgil Ave',
        addressLine2: 'Apt 106',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90020',
      };
      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves({
        Address1: '411 S Virgil Ave',
        Address2: 'Apt 106',
        City: 'Los Angeles',
        State: 'CA',
        Zip5: '90020',
      });

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.body).to.be.deep.eq({
        ...address,
        isMatch: true,
      });
      expect(verifyAddressStub.callCount).to.eq(1);
    });

    it('should return an apartment address if the the address is valid and verified', async () => {
      const address = {
        addressLine1: '817 N Euclid Ave',
        city: 'Pasadena',
        state: 'CA',
        zipCode: '91104',
      };
      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves({
        Address1: '817 N Euclid Ave',
        City: 'Pasadena',
        State: 'CA',
        Zip5: '91104',
      });

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.body).to.be.deep.eq({
        ...address,
        addressLine2: '',
        isMatch: true,
      });
      expect(verifyAddressStub.callCount).to.eq(1);
    });

    it('should return an address if the the address is valid and corrected', async () => {
      const address = {
        addressLine1: '817 N Euclid Ave',
        city: 'Los Jeffrey',
        state: 'CA',
        zipCode: '91104',
      };

      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves({
        Address1: '817 N Euclid Ave',
        City: 'Pasadena',
        State: 'CA',
        Zip5: '91104',
      });

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.body).to.be.deep.eq({
        ...address,
        city: 'Pasadena',
        addressLine2: '',
        isMatch: false,
      });
      expect(verifyAddressStub.callCount).to.eq(1);
    });

    it('should throw an InvalidParametersError if the address passed in is incomplete', async () => {
      const address = {
        city: 'Los Jeffrey',
        state: 'CA',
        zipCode: '91104',
      };

      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();
      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(
        /Required parameters not provided: addressLine1, city, state, zipCode/,
      );
      expect(verifyAddressStub.callCount).to.eq(0);
    });

    it('should throw an UnprocessableEntityError if address is a PO Box', async () => {
      const address = {
        addressLine1: 'Po Box 2134',
        city: 'Paramount',
        state: 'CA',
        zipCode: '90723',
      };

      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves();

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(422);
      expect(response.body.message).to.match(/The address cannot be a P.O. Box\./);
      expect(verifyAddressStub.callCount).to.eq(0);
    });

    it('should throw an USPSResponseError if USPS endpoint fails', async () => {
      const verifyAddressStub = sandbox
        .stub(USPSApi, 'verifyAddress')
        .throws(new USPSResponseError(USPSErrorKey.USPSVerifyAddress));

      const address = {
        addressLine1: '817 N Euclid Ave',
        city: 'Los Jeffrey',
        state: 'CA',
        zipCode: '91104',
      };

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(502);
      expect(response.body.message).to.match(/Failed to verify address with USPS/);
      expect(verifyAddressStub.callCount).to.eq(1);
    });

    it('should throw an UnprocessableEntityError if address is business', async () => {
      const address = {
        addressLine1: '1265 S Cochran Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90019',
      };

      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves({
        Address1: '817 N Euclid Ave',
        City: 'Pasadena',
        State: 'CA',
        Zip5: '91104',
        Business: 'Y',
      });

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(422);
      expect(response.body.message).to.match(
        /Dave is required by federal law to verify a residential address for all members. Unfortunately, commercial or business addresses can’t be used./,
      );
      expect(verifyAddressStub.callCount).to.eq(1);
    });

    it('should throw an UnprocessableEntityError if address is apartment when there should be', async () => {
      const address = {
        addressLine1: '411 S Virgil Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90020',
      };

      const verifyAddressStub = sandbox.stub(USPSApi, 'verifyAddress').resolves({
        Address1: '411 S Virgil Ave',
        City: 'Los Angeles',
        State: 'CA',
        Zip5: '90020',
        ReturnText:
          'Default address: The address you entered was found but more information is needed ' +
          '(such as an apartment, suite, or box number) to match to a specific address.',
        Footnotes: 'H',
      });

      const response = await request(app)
        .post('/v2/user/verify_address')
        .send(address)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(422);
      expect(response.body.message).to.match(
        /Looks like this address has multiple units, so be sure to put in a valid unit number\./,
      );
      expect(verifyAddressStub.callCount).to.eq(1);
    });
  });

  describe('GET /v2/user/account_checks', () => {
    it('should run user account checks', async () => {
      const user = await factory.create('user');
      const mockCheckResult: UserAccountChecks = {
        daveBankingMemberProgram: {
          hasQualifiedDD: true,
          qualifiedIncomes: [999],
        },
      };
      sandbox.stub(AccountChecks, 'performUserAccountChecks').resolves(mockCheckResult);

      const response = await request(app)
        .get('/v2/user/account_checks')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(200);

      expect(response.body).to.deep.equal(mockCheckResult);
    });
  });
});
