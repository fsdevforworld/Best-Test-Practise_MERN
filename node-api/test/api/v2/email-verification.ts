import { expect } from 'chai';
import * as config from 'config';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../factories';
import { userFixture, userSessionFixture } from '../../fixtures';
import * as EmailVerificationHelper from '../../../src/helper/email-verification';
import { EmailVerification, User } from '../../../src/models';
import { userUpdatedEvent } from '../../../src/domain/event';
import app from '../../../src/api';
import { AnalyticsEvent } from '../../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { clean, up } from '../../test-helpers';
import * as Jobs from '../../../src/jobs/data';
import UserHelper from '../../../src/helper/user';

describe('/v2/email_verification/*', () => {
  const sandbox = sinon.createSandbox();

  const fixtures = [userFixture, userSessionFixture];

  before(() => clean());

  beforeEach(async () => {
    await up(fixtures);
  });

  afterEach(() => clean(sandbox));

  describe('GET /email_verification', () => {
    it('responds with the latest email verification for the user', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: null,
      });

      const response = await request(app)
        .get('/v2/email_verification')
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .expect(200);

      const { id, email, verified } = response.body;

      expect(id).to.equal(verification.id);
      expect(email).to.equal('tester@dave.com');
      expect(verified).to.not.exist;
    });

    it('creates an email verification for the user if none exists', async () => {
      const response = await request(app)
        .get('/v2/email_verification')
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .expect(200);

      const { email, verified } = response.body;
      expect(email).to.equal('3@dave.com');
      expect(verified).to.not.exist;
    });

    it('fails if the user doesnt have an email set', async () => {
      await User.update({ email: null }, { where: { id: 3 } });
      const response = await request(app)
        .get('/v2/email_verification')
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .expect(400);

      expect(response.body.message).to.contain('User does not have an email set.');
    });
  });

  describe('GET /email_verification/check_duplicate', () => {
    it('should pass if email not duplicate', async () => {
      await factory.create('user', { phoneNumber: '+11234567890', email: 'test@dave.com' });
      const response = await request(app)
        .get(`/v2/email_verification/check_duplicate`)
        .query({ email: 'test2@dave.com' });
      expect(response.status).to.be.equal(200);
    });

    it('should throw an error if email is duplicate', async () => {
      await factory.create('user', { phoneNumber: '+11234567890', email: 'test@dave.com' });
      const response = await request(app)
        .get(`/v2/email_verification/check_duplicate`)
        .query({ email: 'test@dave.com' });
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    });
  });

  describe('PATCH /email_verification/:id', () => {
    let updateBrazeJobStub: sinon.SinonStub;
    beforeEach(() => {
      updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
    });

    it('updates the email address', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: null,
      });

      await request(app)
        .patch(`/v2/email_verification/${verification.id}`)
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .send({ email: 'foobar@dave.com' })
        .expect(204);

      const updatedVerification = await EmailVerification.findByPk(verification.id);

      expect(updatedVerification.email).to.equal('foobar@dave.com');
    });

    it('should thrown an error if email already exists in another user', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: null,
      });
      const emailVerificationHelperSpy = sandbox.spy(EmailVerificationHelper, 'sendEmail');

      const response = await request(app)
        .patch(`/v2/email_verification/${verification.id}`)
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .send({ email: '9@dave.com' });
      sinon.assert.notCalled(emailVerificationHelperSpy);
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    });

    it('sends an email to the updated address', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: null,
      });

      await request(app)
        .patch(`/v2/email_verification/${verification.id}`)
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .send({ email: 'foobar@dave.com' })
        .expect(204);

      sinon.assert.calledWith(updateBrazeJobStub, {
        userId: 3,
        attributes: {
          email_verified: true,
          unverified_email: 'foobar@dave.com',
        },
        eventProperties: {
          name: AnalyticsEvent.EmailUnverified,
          properties: {
            unverifiedEmail: 'foobar@dave.com',
            obfuscatedEmail: 'f****r@dave.com',
            url: sinon.match.string,
            sendEmail: true,
          },
        },
      });
    });

    it('does not allow updates to already verified items', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: new Date(),
      });

      await request(app)
        .patch(`/v2/email_verification/${verification.id}`)
        .set('Authorization', 'token-3')
        .set('X-Device-Id', 'id-3')
        .send({ email: 'foobar@dave.com' })
        .expect(409);

      const updatedVerification = await EmailVerification.findByPk(verification.id);

      expect(updatedVerification.email).to.equal('tester@dave.com');
    });
  });

  describe('GET /email_verification/verify/:token', () => {
    let updateBrazeJobStub: sinon.SinonStub;
    let updateSynapsepayJobStub: sinon.SinonStub;
    let userUpdatedEventPublishStub: sinon.SinonStub;

    beforeEach(() => {
      updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
      userUpdatedEventPublishStub = sandbox.stub(userUpdatedEvent, 'publish');
      updateSynapsepayJobStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask');
    });

    it('marks the email address as verified', async () => {
      const previousEmail = 'ancientRelic@myspace.com';
      const newEmail = 'tester@dave.com';
      const user = await factory.create<User>('user', { email: previousEmail });
      await EmailVerification.create({
        userId: user.id,
        email: 'jz-o1@dave.com',
        verified: null,
        created: moment()
          .subtract(91, 'days')
          .toDate(),
      });

      await EmailVerification.create({
        userId: user.id,
        email: 'jz-o2@dave.com',
        verified: null,
        created: moment()
          .subtract(89, 'days')
          .toDate(),
      });

      await EmailVerification.create({
        userId: user.id,
        email: 'jz-o3@dave.com',
        verified: null,
        created: moment()
          .subtract(1, 'days')
          .toDate(),
      });

      const verification = await EmailVerification.create({
        userId: user.id,
        email: newEmail,
        verified: null,
      });
      const token = EmailVerificationHelper.generateToken(verification);
      sandbox.stub(UserHelper, 'verifyUserIdentity').resolves({ success: true });

      const response = await request(app).get(`/v2/email_verification/verify/${token}`);
      const websiteURL = config.get('dave.website.url');

      expect(response.status).to.equal(302);
      expect(response.header.location).to.equal(`${websiteURL}/email-verified`);

      await Promise.all([user.reload(), verification.reload()]);

      expect(verification.verified).to.exist;
      expect(user.emailVerified).to.be.true;
      expect(user.email).to.equal(newEmail);
      sinon.assert.calledWithExactly(updateSynapsepayJobStub, {
        userId: user.id,
        options: {
          fields: {
            email: newEmail,
          },
        },
      });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        totalEmailChanges: 3, // the 91 days email is ignored
        emailChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWith(updateBrazeJobStub, {
        userId: user.id,
        attributes: { email: newEmail, email_verified: true, unverified_email: null },
        eventProperties: {
          name: AnalyticsEvent.EmailUpdated,
          properties: { previousEmail, newEmail },
        },
      });
    });

    it('marks the email address as verified and skips updating synapsepay if no identity verification', async () => {
      const previousEmail = 'jeffffffff@dave.com';
      const newEmail = 'tester@dave.com';
      const user = await factory.create<User>('user', { email: previousEmail });
      const verification = await EmailVerification.create({
        userId: user.id,
        email: newEmail,
        verified: null,
      });
      const token = EmailVerificationHelper.generateToken(verification);

      const response = await request(app)
        .get(`/v2/email_verification/verify/${token}`)
        .expect(302);

      const [updatedVerification, websiteURL] = await Promise.all([
        EmailVerification.findByPk(verification.id),
        config.get('dave.website.url'),
        user.reload(),
      ]);

      expect(response.header.location).to.equal(`${websiteURL}/email-verified`);
      expect(updatedVerification.verified).to.exist;
      expect(user.emailVerified).to.be.true;
      expect(user.email).to.equal(newEmail);

      sinon.assert.notCalled(updateSynapsepayJobStub);
      sinon.assert.calledWith(updateBrazeJobStub, {
        userId: user.id,
        attributes: { email: newEmail, email_verified: true, unverified_email: null },
        eventProperties: {
          name: AnalyticsEvent.EmailUpdated,
          properties: { previousEmail, newEmail },
        },
      });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        totalEmailChanges: 1,
        emailChanged: true,
        userId: user.id,
      });
    });

    it('sends Braze the correct payload when previousEmail is null', async () => {
      const user = await factory.create<User>('user', { email: null });
      const newEmail = 'knee_mail@gmail.com';
      const verification = await EmailVerification.create({
        userId: user.id,
        email: newEmail,
        verified: null,
      });
      const token = EmailVerificationHelper.generateToken(verification);
      sandbox.stub(UserHelper, 'verifyUserIdentity').resolves({ success: true });
      await request(app).get(`/v2/email_verification/verify/${token}`);

      await Promise.all([user.reload(), verification.reload()]);

      expect(verification.verified).to.exist;
      expect(user.emailVerified).to.be.true;
      expect(user.email).to.equal(newEmail);
      sinon.assert.calledWith(updateBrazeJobStub, {
        userId: user.id,
        attributes: { email: newEmail, email_verified: true, unverified_email: null },
        eventProperties: {
          name: AnalyticsEvent.EmailUpdated,
          properties: { previousEmail: null, newEmail },
        },
      });
    });

    it('should throw an error if email is duplicate', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: '9@dave.com',
        verified: null,
      });

      const token = EmailVerificationHelper.generateToken(verification);

      const response = await request(app)
        .get(`/v2/email_verification/verify/${token}`)
        .send({ email: '9@dave.com' });
      expect(response.status).to.be.equal(409);
      expect(response.body.message).to.be.match(
        /A user with this email already exists, please enter a different email\./,
      );
    });

    it('should throw an error if email verification is not found', async () => {
      const token = EmailVerificationHelper.generateToken({ id: 1, email: 'sup' });

      const response = await request(app)
        .get(`/v2/email_verification/verify/${token}`)
        .send({ email: '9@dave.com' });
      expect(response.status).to.be.equal(404);
    });

    it('should send to website if email is already verified', async () => {
      const usedVerification = await EmailVerification.create({
        userId: 3,
        email: '3@dave.com',
        verified: moment().toDate(),
      });

      const token = EmailVerificationHelper.generateToken(usedVerification);
      const response = await request(app).get(`/v2/email_verification/verify/${token}`);
      const websiteURL = config.get('dave.website.url');

      expect(response.status).to.equal(302);
      expect(response.header.location).to.equal(`${websiteURL}/email-verified`);

      sinon.assert.notCalled(updateSynapsepayJobStub);
      sinon.assert.notCalled(userUpdatedEventPublishStub);
      sinon.assert.notCalled(updateBrazeJobStub);
    });

    it('does not verify if the email is incorrect', async () => {
      const verification = await EmailVerification.create({
        userId: 3,
        email: 'tester@dave.com',
        verified: null,
      });

      const token = EmailVerificationHelper.generateToken({
        id: verification.id,
        email: 'foobar@dave.com',
      });

      return request(app)
        .get(`/v2/email_verification/verify/${token}`)
        .expect(400);
    });

    it('unauthorized if the token is incorrect', async () => {
      return request(app)
        .get(`/v2/email_verification/verify/foobar`)
        .expect(401);
    });

    it('rolls back updates if updating user or email verification fails', async () => {
      const previousEmail = 'ancientRelic@myspace.com';
      const newEmail = 'tester@dave.com';
      const user = await factory.create<User>('user', { email: previousEmail });
      const verification = await EmailVerification.create({
        userId: user.id,
        email: newEmail,
        verified: null,
      });
      const token = EmailVerificationHelper.generateToken(verification);
      sandbox.stub(UserHelper, 'verifyUserIdentity').resolves({ success: true });
      sandbox.stub(EmailVerification.prototype, 'update').rejects();
      const response = await request(app).get(`/v2/email_verification/verify/${token}`);
      expect(response.status).to.equal(500);
      await Promise.all([user.reload(), verification.reload()]);
      expect(user.email).to.equal(previousEmail);
      expect(verification.verified).to.be.null;
    });
  });
});
