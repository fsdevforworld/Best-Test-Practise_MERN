import * as Faker from 'faker';
import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../src/services/internal-dashboard-api';
import factory from '../../../factories';
import twilio from '../../../../src/lib/twilio';
import { sequelize } from '../../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { AdminComment, PaymentMethod, SynapsepayDocument, User } from '../../../../src/models';
import { clean, createVerificationCode, up, withInternalUser } from '../../../test-helpers';
import { expect } from 'chai';
import phoneNumberVerification from '../../../../src/domain/phone-number-verification';
import loomisClient from '@dave-inc/loomis-client';

describe('/dashboard/user/* endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('should send verification code to the user', () => {
    beforeEach(() => sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true }));
    it('should fail if the user id and delivery type was not provided', async () => {
      const result = await withInternalUser(
        request(app).post('/dashboard/user/send_verification_code'),
      );

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/not provided: userId, deliveryType/);
    });

    it('should fail if the delivery type is not email or phone', async () => {
      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/send_verification_code')
          .send({
            userId: 555,
            deliveryType: 'carrier pigeon',
          }),
      );

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/deliveryType must be phone or email/);
    });

    it('should send a verification code via text message', async () => {
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      const user = await factory.create('user', { phoneNumber: '+11234567890' });

      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/send_verification_code')
          .send({
            userId: user.id,
            deliveryType: 'phone',
          }),
      );

      expect(result.status).to.equal(200);

      expect(sendStub).to.have.callCount(1);

      const sendStubArgs = sendStub.firstCall.args[0];
      expect(sendStubArgs.e164PhoneNumber).to.equal('+11234567890');
    });

    it('should send a verification code via email', async () => {
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      const user = await factory.create('user', {
        phoneNumber: '+11234567890',
        email: 'dude@dave.com',
        emailVerified: true,
      });

      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/send_verification_code')
          .send({
            userId: user.id,
            deliveryType: 'email',
          }),
      );

      expect(result.status).to.equal(200);

      expect(sendStub).to.have.callCount(1);

      const sendStubArgs = sendStub.firstCall.args[0];
      expect(sendStubArgs.e164PhoneNumber).to.equal('+11234567890');
      expect(sendStubArgs.email).to.equal('dude@dave.com');
    });
  });

  describe('should validate a user verification code', () => {
    it('should fail if the user id or code was not provided', async () => {
      const result = await withInternalUser(
        request(app).post('/dashboard/user/validate_verification_code'),
      );

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/not provided: userId, code/);
    });

    it('should fail if the code for the given phone number is incorrect', async () => {
      await up();
      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/validate_verification_code')
          .send({ userId: 1, code: '123456' }),
      );

      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(/code is invalid/);
    });

    it('should fail if the code provided is a legacy 4 digit mfa code', async () => {
      await up();
      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/validate_verification_code')
          .send({ userId: 1, code: '1234' }),
      );

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain(
        'Please download the latest version of Dave to continue.',
      );
    });

    it('should successfully verify correct code', async () => {
      const user = await factory.create('user', { phoneNumber: '+11234567890' });

      await createVerificationCode({ phoneNumber: user.phoneNumber, code: '121212' });

      const result = await withInternalUser(
        request(app)
          .post('/dashboard/user/validate_verification_code')
          .send({ userId: user.id, code: '121212' }),
      );

      expect(result.status).to.equal(200);
    });
  });

  describe('user search', () => {
    it('should return empty list when given empty no querystring at all', async () => {
      const res = await withInternalUser(
        request(app)
          .get('/dashboard/user/search')
          .expect(400),
      );

      expect(res.body.length).to.be.equal(0);
    });

    it('should return empty list when given empty search query', async () => {
      const res = await withInternalUser(
        request(app)
          .get('/dashboard/user/search')
          .query({ q: '' })
          .expect(400),
      );

      expect(res.body.length).to.be.equal(0);
    });

    function userSearch(
      userProps: { firstName: string; lastName: string; phoneNumber: string; email: string },
      { deleted = false }: { deleted?: boolean } = {},
    ) {
      let user: User;
      if (deleted) {
        beforeEach(async () => {
          const phoneNumber = userProps.phoneNumber;

          await sequelize.query(`
            INSERT into user
            (phone_number, email, first_name, last_name, settings, birthdate, address_line1, address_line2, city, state, zip_code, ssn, subscription_start, deleted, is_subscribed, synapsepay_id)
            VALUES
            (concat('${phoneNumber}', '-', 'deleted-', unix_timestamp()),'${userProps.email}', '${userProps.firstName}', '${userProps.lastName}', '{}', '1980-01-01', null, null, null, null, null, null, NOW() - INTERVAL 2 MONTH, NOW(), true, null)
          `);

          user = await User.findOne({ where: { email: userProps.email }, paranoid: false });
        });
      } else {
        beforeEach(async () => {
          user = await factory.create<User>('user', userProps);
        });
      }

      it('should return user details when given 10-digit phone number', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: ` ${userProps.phoneNumber.slice(2)} ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return user details when given 11-digit phone number', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: ` ${userProps.phoneNumber.slice(1)} ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return user details when given email', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: `      ${user.email}   ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return user details when given full name', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: `  ${user.firstName}    ${user.lastName}   ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return user details when given first name', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: `    ${user.firstName} ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
      });

      it('should return user details when given last name', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: ` ${user.lastName}    ` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return user when given user id', async () => {
        const res = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: `${user.id}` })
            .expect(200),
        );

        expect(res.body.length).to.be.above(0);
        expect(res.body[0].user.firstName).to.be.equal(user.firstName);
        expect(res.body[0].user.lastName).to.be.equal(user.lastName);
      });

      it('should return all user accounts associated with number including soft deleted', async () => {
        const phoneNumber = Faker.phone.phoneNumber('+1##########');
        const deletedUser = await factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-123`,
        });
        await deletedUser.destroy();
        const activeUser = await factory.create('user', { phoneNumber });

        const response = await withInternalUser(
          request(app)
            .get('/dashboard/user/search')
            .query({ q: phoneNumber })
            .expect(200),
        );

        expect(response.body.length).to.be.equal(2);
        expect(response.body[0].user.phoneNumber).to.have.string(activeUser.phoneNumber);
        expect(response.body[1].user.phoneNumber).to.have.string(activeUser.phoneNumber);
      });
    }

    context('when the user is active', () => {
      userSearch({
        firstName: 'David',
        lastName: 'Boreanaz',
        phoneNumber: '+11000000006',
        email: '6@dave.com',
      });
    });

    context('when the user is deleted', () => {
      const user = {
        firstName: 'Randy',
        lastName: 'Jackson',
        phoneNumber: '+11000000123',
        email: '123@dave.com',
      };

      userSearch(user, { deleted: true });
    });

    it('returns users with matching device id', async () => {
      const user = await factory.create('user');
      const userSession = await factory.create('user-session', { userId: user.id });

      const query = userSession.deviceId;

      const response = await withInternalUser(
        request(app)
          .get('/dashboard/user/search')
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);
      const [{ user: resultUser }] = response.body;
      expect(resultUser.id).to.eq(user.id);
    });

    it('returns users with matching deleted device id', async () => {
      const user = await factory.create('user');
      const userSession = await factory.create('user-session', {
        userId: user.id,
        deleted: moment(),
      });

      const query = userSession.deviceId;

      const response = await withInternalUser(
        request(app)
          .get('/dashboard/user/search')
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);
      const [{ user: resultUser }] = response.body;
      expect(resultUser.id).to.eq(user.id);
    });

    it('returns users with a matching unverified email address', async () => {
      const user = await factory.create('user', {
        email: null,
      });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'kanye@dave.com',
        verified: null,
      });

      const url = '/dashboard/user/search';
      const query = 'kanye@dave.com';

      const response = await withInternalUser(
        request(app)
          .get(url)
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.latestUnverifiedEmail).to.equal(query);
      expect(resultUser.emailVerified).to.equal(false);
    });

    it('returns users with an existing verified email address and a matching unverified email address', async () => {
      const user = await factory.create('user', { email: 'yeezy@dave.com' });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'kanye@dave.com',
        verified: null,
      });

      const url = '/dashboard/user/search';
      const query = 'kanye@dave.com';

      const response = await withInternalUser(
        request(app)
          .get(url)
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.latestUnverifiedEmail).to.equal(query);
      expect(resultUser.emailVerified).to.equal(true);
    });

    it('returns a single result when there are multiple unverified email verifictions', async () => {
      const user = await factory.create('user', {
        email: null,
      });

      await Promise.all([
        factory.create('email-verification', {
          userId: user.id,
          email: 'kanye@dave.com',
          verified: null,
        }),
        factory.create('email-verification', {
          userId: user.id,
          email: 'kanye@dave.com',
          verified: null,
        }),
      ]);

      const url = '/dashboard/user/search';
      const query = 'kanye@dave.com';

      const response = await withInternalUser(
        request(app)
          .get(url)
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.latestUnverifiedEmail).to.equal(query);
      expect(resultUser.emailVerified).to.equal(false);
    });

    it('returns a single result when user has same verified and unverified email', async () => {
      const user = await factory.create('user', { email: 'yeezy@dave.com' });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'yeezy@dave.com',
        verified: moment(),
      });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'yeezy@dave.com',
        verified: null,
      });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'yeezy@dave.com',
        verified: null,
      });

      const url = '/dashboard/user/search';
      const query = 'yeezy@dave.com';

      const response = await withInternalUser(
        request(app)
          .get(url)
          .query({ q: query })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.latestUnverifiedEmail).to.equal(query);
      expect(resultUser.emailVerified).to.equal(true);
    });

    it('includes the latestUnverifiedEmail address for matching users', async () => {
      const user = await factory.create('user', {
        email: null,
        lastName: 'west',
      });

      await factory.create('email-verification', {
        userId: user.id,
        email: 'kanye@dave.com',
        verified: null,
      });

      const url = '/dashboard/user/search';

      const response = await withInternalUser(
        request(app)
          .get(url)
          .query({ q: 'west' })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.latestUnverifiedEmail).to.equal('kanye@dave.com');
      expect(resultUser.emailVerified).to.equal(false);
    });

    it('includes users with a synapsepay document with a matching synapsepayUserId', async () => {
      const user = await factory.create<User>('user');

      await factory.create<SynapsepayDocument>('synapsepay-document', {
        userId: user.id,
        synapsepayUserId: '1abcd',
      });

      const response = await withInternalUser(
        request(app)
          .get('/dashboard/user/search')
          .query({ q: '1abcd' })
          .expect(200),
      );

      expect(response.body.length).to.be.equal(1);

      const [{ user: resultUser }] = response.body;
      expect(resultUser.id).to.equal(user.id);
    });
  });

  describe('user deleted bank details', () => {
    it('should return user deleted details when given user id', async () => {
      await up();
      const uid = 1600;

      const getPaymentMethodsStub = sandbox.stub(loomisClient, 'getPaymentMethods').resolves({
        data: [
          {
            bankAccountId: 1600,
            deleted: '2021-06-23T10:30:58.000Z',
          },
          {
            bankAccountId: 1600,
          },
          {
            bankAccountId: 1601,
            deleted: '2021-06-23T10:30:58.000Z',
          },
        ],
      });

      const res = await withInternalUser(
        request(app)
          .get(`/dashboard/user/deleted_details/${uid}`)
          .expect(200),
      );

      expect(res.body.connections_deleted).to.be.an('array');
      expect(res.body.connections_deleted[0].deleted).to.be.equal('2018-03-20T10:30:58.000Z');
      expect(res.body.connections_deleted[0].accounts).to.be.an('array');
      expect(res.body.connections_deleted[0].accounts[0].deleted).to.be.equal(
        '2018-03-20T10:30:58.000Z',
      );
      expect(res.body.connections_deleted[0].accounts[0].methods).to.be.an('array');
      expect(res.body.connections_deleted[0].accounts[0].methods[0].deleted).to.be.equal(
        '2021-06-23T10:30:58.000Z',
      );

      sinon.assert.calledOnce(getPaymentMethodsStub);
      sinon.assert.calledWithExactly(getPaymentMethodsStub.firstCall, '1600', {
        includeSoftDeleted: true,
      });
    });

    it('should error when the loomis client errors', async () => {
      await up();
      const uid = 1600;

      sandbox.stub(loomisClient, 'getPaymentMethods').resolves({
        error: { message: 'some error' },
      });

      await withInternalUser(
        request(app)
          .get(`/dashboard/user/deleted_details/${uid}`)
          .expect(500),
      );
    });
  });

  describe('/dashboard/user/duplicate_payment_method', () => {
    it('finds the user with a debit card that matches the duplicate id', async () => {
      const debitCard = await factory.create<PaymentMethod>('payment-method', {
        tabapayId: 'foo-123',
      });

      const res = await withInternalUser(
        request(app)
          .get('/dashboard/user/duplicate_payment_method')
          .query({
            tabapayIds: 'foo-123',
          }),
      );

      expect(res.body.userIds).to.deep.equal([debitCard.userId]);
    });

    it('handles multiple tabapayIds', async () => {
      const [debitCardA, debitCardB] = await Promise.all([
        factory.create<PaymentMethod>('payment-method', {
          tabapayId: 'foo-123',
        }),
        factory.create<PaymentMethod>('payment-method', {
          tabapayId: 'baz-456',
        }),
      ]);

      const res = await withInternalUser(
        request(app)
          .get('/dashboard/user/duplicate_payment_method')
          .query({
            tabapayIds: 'foo-123,baz-456',
          }),
      );

      expect(res.body.userIds.length).to.equal(2);
      expect(res.body.userIds).to.have.members([debitCardA.userId, debitCardB.userId]);
    });

    it('handles soft deleted data', async () => {
      const debitCard = await factory.create<PaymentMethod>('payment-method', {
        tabapayId: 'foo-123',
      });

      const user = await User.findByPk(debitCard.userId);

      await Promise.all([debitCard.destroy(), user.destroy()]);

      const res = await withInternalUser(
        request(app)
          .get('/dashboard/user/duplicate_payment_method')
          .query({
            tabapayIds: 'foo-123',
          }),
      );

      expect(res.body.userIds).to.deep.equal([debitCard.userId]);
    });

    it('should return 404 when user is not found', async () => {
      await withInternalUser(
        request(app)
          .get('/dashboard/user/duplicate_payment_method')
          .query({ tabapayIds: 'not-here' })
          .expect(404),
      );
    });
  });

  describe('POST /admin_comment', () => {
    it('should create an admin comment and send it back', async () => {
      const user = await factory.create('user');

      const res = await withInternalUser(
        request(app)
          .post('/dashboard/admin_comment')
          .send({
            userId: user.id,
            message: 'I am the alpha and the omega',
            isHighPriority: true,
          })
          .expect(200),
      );

      expect(res.body.userId).to.equal(user.id);
      expect(res.body.message).to.equal('I am the alpha and the omega');
      expect(res.body.isHighPriority).to.equal(true);

      const adminComment = await AdminComment.findOne({ where: { userId: user.id } });

      expect(adminComment.userId).to.equal(user.id);
      expect(adminComment.message).to.equal('I am the alpha and the omega');
      expect(adminComment.isHighPriority).to.equal(true);
    });

    it('should raise an invalid parameters error', async () => {
      const res = await withInternalUser(
        request(app)
          .post('/dashboard/admin_comment')
          .send({
            message: 'I am the alpha and the omega',
            isHighPriority: true,
          })
          .expect(400),
      );

      expect(res.body.message).to.match(
        /Required parameters not provided: userId, message, isHighPriority/,
      );
    });
  });
});
