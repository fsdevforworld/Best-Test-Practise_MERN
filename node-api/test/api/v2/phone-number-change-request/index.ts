import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../src/api';
import factory from '../../../factories';
import { moment } from '@dave-inc/time-lib';
import * as Faker from 'faker';
import sendgrid from '../../../../src/lib/sendgrid';
import twilio from '../../../../src/lib/twilio';

import { DeleteRequest, PhoneNumberChangeRequest, User } from '../../../../src/models';
import { expect } from 'chai';
import { clean, createVerificationCode } from '../../../test-helpers';
import { CUSTOM_ERROR_CODES } from '../../../../src/lib/error';
import * as SynapsepayLib from '../../../../src/domain/synapsepay';
import UserHelper from '../../../../src/helper/user';
import phoneNumberVerification from '../../../../src/domain/phone-number-verification';
import * as eventDomain from '../../../../src/domain/event';
import * as Jobs from '../../../../src/jobs/data';
import { AnalyticsEvent } from '../../../../src/typings';
import * as sombraClient from '../../../../src/services/sombra/client';

describe('Phone Number Change Request', () => {
  const sandbox = sinon.createSandbox();
  const baseUrl = '/v2/phone_number_change_request';
  let updateSynapsepayUserJobStub: sinon.SinonStub;
  let updateBrazeJobStub: sinon.SinonStub;
  let userUpdatedEventPublishStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(async () => {
    sandbox.stub(sendgrid, 'send').resolves();
    updateSynapsepayUserJobStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
    updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask').resolves();
    userUpdatedEventPublishStub = sandbox.stub(eventDomain.userUpdatedEvent, 'publish').resolves();
    sandbox.stub(sombraClient, 'exchangeSession').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('POST /phone_number_change_request', () => {
    const oldPhoneNumber = '+11000000011';
    const newPhoneNumber = '+12813308004';
    const code = '111222';

    function validPhoneNumberChangeRequest(endpoint: string) {
      return request(app)
        .post(endpoint)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        });
    }

    context('Rate Limit', () => {
      it('rate limits requests by ip', async () => {
        const badRequest = async (oldPhone: string, newPhone: string) =>
          await request(app)
            .post(baseUrl)
            .set('X-App-Version', '2.16.8')
            .set('X-Forwarded-For', '1.2.3.4')
            .send({
              oldPhoneNumber: oldPhone,
              newPhoneNumber: newPhone,
              code: '999999',
            });
        await badRequest('1234567890', '2345678901');
        await badRequest('1234567891', '2345678902');
        await badRequest('1234567892', '2345678903');
        await badRequest('1234567893', '2345678904');
        await badRequest('1234567894', '2345678905');

        const shouldBeRateLimitedRequest = await badRequest('1234567895', '2345678906');
        expect(shouldBeRateLimitedRequest.status).to.equal(429);
      });

      it('rate limits requests by old phone number', async () => {
        const badRequest = async (ip: string, newPhone: string) =>
          await request(app)
            .post(baseUrl)
            .set('X-App-Version', '2.16.8')
            .set('X-Forwarded-For', ip)
            .send({
              oldPhoneNumber,
              newPhoneNumber: newPhone,
              code: '999999',
            });
        await badRequest('1.2.3.4', '+1234567890');
        await badRequest('1.2.3.5', '+1234567891');
        await badRequest('1.2.3.6', '+1234567892');
        await badRequest('1.2.3.7', '+1234567893');
        await badRequest('1.2.3.8', '+1234567894');

        const shouldBeRateLimitedRequest = await badRequest('1.2.3.9', '+1234567895');
        expect(shouldBeRateLimitedRequest.status).to.equal(429);
      });

      it('rate limits requests by new phone number', async () => {
        const badRequest = async (ip: string, oldPhone: string) =>
          await request(app)
            .post(baseUrl)
            .set('X-App-Version', '2.16.8')
            .set('X-Forwarded-For', ip)
            .send({
              oldPhoneNumber: oldPhone,
              newPhoneNumber,
              code: '999999',
            });
        await badRequest('1.2.3.4', '+1234567890');
        await badRequest('1.2.3.5', '+1234567891');
        await badRequest('1.2.3.6', '+1234567892');
        await badRequest('1.2.3.7', '+1234567893');
        await badRequest('1.2.3.8', '+1234567894');

        const shouldBeRateLimitedRequest = await badRequest('1.2.3.9', '+1234567895');
        expect(shouldBeRateLimitedRequest.status).to.equal(429);
      });
    });

    it('creates a phone number change request', async () => {
      const user = await factory.create('user', {
        phoneNumber: oldPhoneNumber,
        email: 'some email',
      });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });
      const res = await validPhoneNumberChangeRequest(baseUrl);

      expect(res.status).to.equal(201);

      const pncr = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      const { newPhoneNumber: number, userId, verificationCode, verified } = pncr;

      expect(number).to.equal('+12813308004');
      expect(userId).to.equal(user.id);
      expect(verificationCode).to.exist;
      expect(verified).to.be.null;
    });

    it('sends a verification email', async () => {
      await factory.create('user', {
        phoneNumber: oldPhoneNumber,
        email: 'some email',
      });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });
      const res = await validPhoneNumberChangeRequest(baseUrl);
      expect(res.body.emailSent).to.be.true;
    });

    it('throws a 400 when an invalid verification code is supplied', async () => {
      await Promise.all([
        factory.create('user', { phoneNumber: oldPhoneNumber, email: Faker.internet.email() }),
        createVerificationCode({ phoneNumber: '+12813308004', code: '555555' }),
      ]);
      return request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        })
        .expect(400);
    });

    it('throws a 400 when an legacy 4 digit verification code is supplied', async () => {
      await Promise.all([
        factory.create('user', { phoneNumber: oldPhoneNumber, email: Faker.internet.email() }),
        createVerificationCode({ phoneNumber: '+12813308004', code: '123456' }),
      ]);
      const result = await request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code: '1234',
        });
      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain(
        'Please download the latest version of Dave to continue.',
      );
    });

    it('fails if the version is below 2.6.5', async () => {
      return request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.5.0')
        .expect(400);
    });

    it('handles invalid phone numbers', () => {
      return request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.6.5')
        .send({
          oldPhoneNumber: 'sdfsfd',
        })
        .expect(400);
    });

    it('handles when the new phone number belongs to an existing user', async () => {
      const inUsePhoneNumber = '+11000000003';
      await factory.create('user', { phoneNumber: inUsePhoneNumber });
      await factory.create('user', { phoneNumber: oldPhoneNumber });

      await createVerificationCode({ phoneNumber: newPhoneNumber, code });
      return request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber: inUsePhoneNumber,
          code,
        })
        .expect(409);
    });

    it('handles old phone numbers that do not belong to an existing user', async () => {
      await factory.create('user', { phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });
      return request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber: '2850000000',
          newPhoneNumber,
          code,
        })
        .expect(404);
    });

    it('sends back a pncr id when user does not have email and has bank account', async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      await user.update({ phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });
      const res = await request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        });
      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });

      expect(res.status).to.equal(201);
      expect(res.body.id).to.equal(changeRequest.id);
      expect(res.body.emailSent).to.be.false;
    });

    it('does not create a pncr verificationCode when the user does not have email and has bank account', async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      await user.update({ phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      await request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        })
        .expect(201);

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      expect(changeRequest.verificationCode).to.be.null;
    });

    it('updates the user when they do not have email or bank account', async () => {
      const user = await factory.create('user', { phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      const res = await request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        });
      expect(res.status).to.equal(201);
      expect(res.body.id).to.not.exist;
      expect(res.body.emailSent).to.be.false;

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      await user.reload();
      expect(changeRequest.verified).to.exist;
      expect(user.phoneNumber).to.equal('+12813308004');
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('still updates the user when they do not have email/bank account when an error occurs while enqueing UpdateSynapsepayUser job', async () => {
      const user = await factory.create('user', { phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      const res = await request(app)
        .post(baseUrl)
        .set('X-App-Version', '2.16.8')
        .send({
          oldPhoneNumber,
          newPhoneNumber,
          code,
        });
      expect(res.status).to.equal(201);
      expect(res.body.id).to.not.exist;
      expect(res.body.emailSent).to.be.false;

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      await user.reload();
      expect(changeRequest.verified).to.exist;
      expect(user.phoneNumber).to.equal('+12813308004');
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });
  });

  describe('PATCH /phone_number_change_request/:id', () => {
    it('requires the last four digits of a bank account', async () => {
      const bankAccount = await factory.create('bank-account', { lastFour: '1234' });
      const user = await User.findByPk(bankAccount.userId);
      const phoneNumber = '+11000000005';
      await user.update({ phoneNumber });
      const newPhoneNumber = '+12813308004';
      const changeRequest = await PhoneNumberChangeRequest.create({
        userId: user.id,
        oldPhoneNumber: phoneNumber,
        newPhoneNumber,
        verificationCode: null,
      });
      await request(app)
        .patch(`${baseUrl}/${changeRequest.id}`)
        .send({ verificationCode: '1234' })
        .expect(200);

      await user.reload();
      await changeRequest.reload();
      expect(user.phoneNumber).to.equal(newPhoneNumber);
      expect(changeRequest.verified).to.exist;
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('handles bank accounts where lastFour has 3 digits', async () => {
      const bankAccount = await factory.create('bank-account', { lastFour: '234' });
      const user = await User.findByPk(bankAccount.userId);
      const phoneNumber = '+11000000005';
      await user.update({ phoneNumber });
      const newPhoneNumber = '+12813308004';
      const changeRequest = await PhoneNumberChangeRequest.create({
        userId: user.id,
        oldPhoneNumber: phoneNumber,
        newPhoneNumber,
        verificationCode: null,
      });
      await request(app)
        .patch(`${baseUrl}/${changeRequest.id}`)
        .send({ verificationCode: '1234' })
        .expect(200);
      await user.reload();
      await changeRequest.reload();
      expect(user.phoneNumber).to.equal(newPhoneNumber);
      expect(changeRequest.verified).to.exist;
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('errors when the change request has a verification code', async () => {
      const bankAccount = await factory.create('bank-account', { lastFour: '1234' });
      const user = await User.findByPk(bankAccount.userId);
      const phoneNumber = '+11000000005';
      await user.update({ phoneNumber });
      const newPhoneNumber = '+12813308004';
      const changeRequest = await PhoneNumberChangeRequest.create({
        userId: user.id,
        oldPhoneNumber: phoneNumber,
        newPhoneNumber,
        verificationCode: 'foo',
      });

      return request(app)
        .patch(`${baseUrl}/${changeRequest.id}`)
        .send({ verificationCode: '1234' })
        .expect(400);
    });

    it('errors when the last four does not match', async () => {
      const bankAccount = await factory.create('bank-account', { lastFour: '1234' });
      const user = await User.findByPk(bankAccount.userId);
      const phoneNumber = '+11000000005';
      await user.update({ phoneNumber });
      const newPhoneNumber = '+12813308004';
      const changeRequest = await PhoneNumberChangeRequest.create({
        userId: user.id,
        oldPhoneNumber: phoneNumber,
        newPhoneNumber,
        verificationCode: null,
      });

      return request(app)
        .patch(`${baseUrl}/${changeRequest.id}`)
        .send({ verificationCode: '5678' })
        .expect(400);
    });
  });

  describe('GET /phone_number_change_request/:id/verify', () => {
    it('throws a not found error if the phone number change request cannot be found', async () => {
      const id = 0;
      return request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'foo' })
        .expect(404);
    });

    it("updates the user's phone number and sets the verified timestamp", async () => {
      const userId = 4;
      const oldPhoneNumber = '+11000000004';
      const user = await factory.create('user', { id: userId, phoneNumber: oldPhoneNumber });
      const newPhoneNumber = '+12803308004';
      const phoneNumberChange = await PhoneNumberChangeRequest.create({
        userId,
        oldPhoneNumber,
        newPhoneNumber,
        verificationCode: 'foo',
      });

      const { id } = await PhoneNumberChangeRequest.findOne({ where: { newPhoneNumber } });

      await request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'foo' })
        .expect(200);

      await user.reload();
      await phoneNumberChange.reload();
      expect(user.phoneNumber).to.equal(newPhoneNumber);
      expect(phoneNumberChange.verified).to.exist;
      sinon.assert.calledWith(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('should throw a ConflictError if the new number already belongs to a user', async () => {
      const userId = 4;
      const oldPhoneNumber = '+11000000004';
      const newPhoneNumber = '+12803308004';
      await Promise.all([
        factory.create('user', { id: userId, phoneNumber: oldPhoneNumber }),
        factory.create('user', { phoneNumber: newPhoneNumber }),
      ]);
      await PhoneNumberChangeRequest.create({
        userId,
        oldPhoneNumber,
        newPhoneNumber,
        verificationCode: 'foo',
      });

      const { id } = await PhoneNumberChangeRequest.findOne({ where: { newPhoneNumber } });

      const response = await request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'foo' });

      expect(response.status).to.be.eq(409);
      expect(response.body.message).to.be.match(/^User with this phone number already exists\./);
    });

    it('does not perform the update when the verification code is invalid', async () => {
      const userId = 4;
      const oldPhoneNumber = '+11000000004';
      await factory.create('user', { id: userId, phoneNumber: oldPhoneNumber });
      await PhoneNumberChangeRequest.create({
        userId,
        oldPhoneNumber,
        newPhoneNumber: '+12813308004',
        verificationCode: 'foo',
      });

      const { id } = await PhoneNumberChangeRequest.findOne({ where: { userId } });

      const result = await request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'baz' })
        .expect(400);

      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.INVALID_VERIFICATION_CODE);
    });

    it('fails with a 409 if the change request has been previously verified', async () => {
      const userId = 4;
      const oldPhoneNumber = '+11000000004';
      await factory.create('user', { id: userId, phoneNumber: oldPhoneNumber });
      await PhoneNumberChangeRequest.create({
        userId,
        oldPhoneNumber: '+11000000004',
        newPhoneNumber: '+12813308004',
        verificationCode: 'foo',
        verified: moment(),
      });

      const { id } = await PhoneNumberChangeRequest.findOne({ where: { userId } });

      const result = await request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'foo' })
        .expect(409);

      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.CHANGE_REQUEST_EXPIRED);
    });

    it("does not perform the update if the user's current phone number is different from the change request", async () => {
      const userId = 4;
      const oldPhoneNumber = '+11000000004';
      await factory.create('user', { id: userId, phoneNumber: oldPhoneNumber });
      await PhoneNumberChangeRequest.create({
        userId,
        oldPhoneNumber,
        newPhoneNumber: '+12813308004',
        verificationCode: 'foo',
      });

      const [{ id }] = await Promise.all([
        PhoneNumberChangeRequest.findOne({ where: { userId } }),
        User.update({ phoneNumber: '+19098675309' }, { where: { id: userId } }),
      ]);

      return request(app)
        .get(`${baseUrl}/${id}/verify`)
        .query({ verificationCode: 'foo' })
        .expect(409);
    });
  });

  describe('POST /v2/phone-number-change-request/reclaim', () => {
    let oldUser: any;
    let bankConnection: any;
    let bankAccount: any;
    let newUser: any;

    beforeEach(async () => {
      oldUser = await factory.create('user', { phoneNumber: '+11111111111' });
      bankConnection = await factory.create('bank-connection', { userId: oldUser.id });
      bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection,
        accountNumber: '1234',
      });
      newUser = await factory.create('user', { phoneNumber: '+12222222222' }, { hasSession: true });
    });

    it('should create a change request, delete the new user, and change the phone number', async () => {
      const deleteSynapsePayUserStub = sandbox
        .stub(SynapsepayLib, 'deleteSynapsePayUser')
        .resolves();
      await request(app)
        .post(`${baseUrl}/reclaim`)
        .set('Authorization', newUser.id)
        .set('X-Device-Id', newUser.id)
        .send({
          newUserId: newUser.id,
          oldPhoneNumber: oldUser.phoneNumber,
          newPhoneNumber: newUser.phoneNumber,
          accountNumber: bankAccount.accountNumber,
        })
        .expect(200);
      expect(deleteSynapsePayUserStub.calledOnce).to.equal(true);

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: {
          oldPhoneNumber: oldUser.phoneNumber,
        },
      });
      const deleteRequest = await DeleteRequest.findOne({ where: { userId: newUser.id } });
      const updatedUser = await User.findByPk(oldUser.id);
      const deletedUser = await User.findByPk(newUser.id, { paranoid: false });

      expect(changeRequest.newPhoneNumber).to.equal(newUser.phoneNumber);
      expect(deleteRequest.reason).to.equal('duplicate account');
      expect(updatedUser.phoneNumber).to.equal(newUser.phoneNumber);
      expect(deletedUser.overrideSixtyDayDelete).to.equal(true);
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: updatedUser.id });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: updatedUser.id,
        attributes: { phoneNumber: updatedUser.phoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('should fail if the old and new users do not have the same bank account', async () => {
      const result = await request(app)
        .post(`${baseUrl}/reclaim`)
        .set('Authorization', newUser.id)
        .set('X-Device-Id', newUser.id)
        .send({
          newUserId: newUser.id,
          oldPhoneNumber: oldUser.phoneNumber,
          newPhoneNumber: newUser.phoneNumber,
          accountNumber: '5678',
        });

      expect(result.status).to.equal(400);
      expect(result.body.customCode).to.equal(600);
    });

    it('should fail if all parameters are not provided', async () => {
      const result = await request(app)
        .post(`${baseUrl}/reclaim`)
        .set('Authorization', newUser.id)
        .set('X-Device-Id', newUser.id)
        .send({
          newUserId: newUser.id,
          oldPhoneNumber: oldUser.phoneNumber,
          newPhoneNumber: newUser.phoneNumber,
        });

      expect(result.status).to.equal(400);
      expect(result.body.type).to.equal('invalid_parameters');
    });
  });

  describe('POST /phone_number_change/text_verification', () => {
    beforeEach(async () => {
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      sandbox.stub(phoneNumberVerification, 'send').resolves();
      sandbox.stub(UserHelper, 'getCoolOffStatus').resolves({
        coolOffDate: null,
        isCoolingOff: false,
      });
    });

    it('should return success and update the user with a valid code', async () => {
      const phoneNumber = '+11232162044';
      const user = await factory.create('user', { phoneNumber });
      const newPhoneNumber = '+17822894993';
      await createVerificationCode({ phoneNumber: newPhoneNumber, code: '284528' });
      const res = await request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: newPhoneNumber, code: '284528' })
        .expect(200);

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { newPhoneNumber },
      });

      await user.reload();
      expect(res.body.phoneNumber).to.equal(newPhoneNumber);
      expect(user.phoneNumber).to.equal(newPhoneNumber);
      expect(changeRequest).to.be.not.null;
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('should fail if the number is in use', async () => {
      const inUsePhoneNumber = '+18889994241';
      await factory.create('user', { phoneNumber: inUsePhoneNumber });

      const user = await factory.create('user', { phoneNumber: '+12223334444' });

      await UserHelper.sendVerificationCode({ phoneNumber: inUsePhoneNumber });

      return request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: inUsePhoneNumber, code: '111211' })
        .expect(409);
    });

    it('should fail if the number is in use even with different format', async () => {
      const inUsePhoneNumber = '+11232162044';
      await factory.create('user', { phoneNumber: inUsePhoneNumber });
      const user = await factory.create('user', { phoneNumber: '+12223334444' });

      return request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: '(123)-216-2044', code: '111211' })
        .expect(409);
    });

    it('should fail if the number is null', async () => {
      const user = await factory.create('user', { phoneNumber: '+11232162044' });
      return request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: null, code: '111211' })
        .expect(400);
    });

    it('should fail if the code is null', async () => {
      const user = await factory.create('user', { phoneNumber: '+11232162044' });
      return request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: '+13336669999', code: null })
        .expect(400);
    });

    it('should fail if the code is invalid', async () => {
      const phoneNumber = '+11232162044';
      const user = await factory.create('user', { phoneNumber });
      const newPhoneNumber = '+17822894993';
      await createVerificationCode({ phoneNumber: newPhoneNumber, code: '284525' });

      return request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: newPhoneNumber, code: '348444' })
        .expect(400);
    });

    it('should fail if the code is a legacy 4 digit mfa code', async () => {
      const phoneNumber = '+11232162044';
      const user = await factory.create('user', { phoneNumber });
      const newPhoneNumber = '+17822894993';
      await createVerificationCode({ phoneNumber: newPhoneNumber, code: '284525' });

      const result = await request(app)
        .post('/v2/phone_number_change/text_verification')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({ phoneNumber: newPhoneNumber, code: '2845' });
      expect(result.status).to.be.equal(400);
      expect(result.body.message).to.be.contain(
        'Please download the latest version of Dave to continue.',
      );
    });
  });
});
