import { expect } from 'chai';
import { omit } from 'lodash';
import { QueryTypes } from 'sequelize';
import * as sinon from 'sinon';
import * as Config from 'config';
import {
  BankAccountSubtype,
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import factory from '../factories';
import { clean, stubBankTransactionClient, stubLoomisClient, up } from '../test-helpers';

import * as SynapsepayLib from '../../src/domain/synapsepay';

import phoneNumberVerification from '../../src/domain/phone-number-verification';
import UserHelper, {
  fetchName,
  validateNameUpdate,
  verifyUserIdentity,
  isAddressUpdateAllowed,
} from '../../src/helper/user';
import * as identityApi from '../../src/domain/identity-api';
import { agent as verifyAgent } from '../../src/lib/address-verification';
import amplitude from '../../src/lib/amplitude';

import { dogstatsd } from '../../src/lib/datadog-statsd';
import {
  CUSTOM_ERROR_CODES,
  GenericUpstreamError,
  InvalidParametersError,
} from '../../src/lib/error';
import { moment } from '@dave-inc/time-lib';

import redis from '../../src/lib/redis';
import sendgrid from '../../src/lib/sendgrid';
import { sequelize } from '../../src/models';
import twilio from '../../src/lib/twilio';
import { ZENDESK_CUSTOM_FIELD_ID } from '../../src/lib/zendesk/constants';
import {
  AuditLog,
  BankConnection,
  SynapsepayDocument,
  ThirdPartyName,
  User,
  UserAddress,
} from '../../src/models';
import {
  AddressUpdateRejectReason,
  SynapsepayDeliverabilityStatus,
  SynapsepayDocumentLicenseStatus,
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
} from '../../src/typings';
import Sinon from 'sinon';
import { URL } from 'url';

describe('User', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  describe('getDueSubscribers', () => {
    it('includes users with a current unpaid billing', async () => {
      const user = await factory.create('subscribed-user', {
        subscriptionStart: '2018-01-01',
      });

      await factory.create('subscription-billing', {
        userId: user.id,
        start: moment()
          .startOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
        end: moment()
          .endOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
      });

      const userIds = (await User.getDueSubscribers()).map((u: any) => u.id);

      expect(userIds).to.include(user.id);
    });

    it('excludes users with no current billing', async () => {
      const user = await factory.create('subscribed-user', {
        subscriptionStart: '2018-01-01',
      });

      const userIds = (await User.getDueSubscribers()).map((u: any) => u.id);

      expect(userIds).to.not.include(user.id);
    });

    it('excludes users that have paid their current billing', async () => {
      const subscriptionPayment = await factory.create('subscription-payment', {
        status: 'COMPLETED',
      });

      const user = await User.findByPk(subscriptionPayment.userId);
      await user.update({
        subscriptionStart: '2018-01-01',
      });

      const subscriptionBilling = await factory.create('subscription-billing', {
        userId: user.id,
        start: moment()
          .startOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
        end: moment()
          .endOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
      });

      await sequelize.query(
        `
          INSERT INTO subscription_payment_line_item (subscription_payment_id, subscription_billing_id)
          VALUES (?, ?)
        `,
        { replacements: [subscriptionPayment.id, subscriptionBilling.id], type: QueryTypes.INSERT },
      );

      const userIds = (await User.getDueSubscribers()).map((u: any) => u.id);

      expect(userIds).to.not.include(user.id);
    });

    it('excludes deleted users', async () => {
      const user = await factory.create('subscribed-user', {
        subscriptionStart: '2018-01-01',
        deleted: moment().format('YYYY-MM-DD HH:mm:ss'),
      });

      await factory.create('subscription-billing', {
        userId: user.id,
        start: moment()
          .startOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
        end: moment()
          .endOf('month')
          .format('YYYY-MM-DD HH:mm:ss'),
      });

      const userIds = (await User.getDueSubscribers()).map((u: any) => u.id);

      expect(userIds).to.not.include(user.id);
    });
  });

  describe('getNextSubscriptionPaymentDate', () => {
    it('is the due date on the subscription billing', async () => {
      const dueDate = '2018-08-12';

      const user = await factory.create('user');
      await factory.create('subscription-billing', {
        userId: user.id,
        start: moment(dueDate).startOf('month'),
        end: moment(dueDate).endOf('month'),
        billingCycle: moment(dueDate).format('YYYY-MM'),
        dueDate,
      });

      const date = await UserHelper.getNextSubscriptionPaymentDate(user, '2018-08-04');

      expect(date).to.equal(dueDate);
    });

    it('is null if the user is deleted', async () => {
      const dueDate = '2018-08-12';

      const user = await factory.create('user', {
        deleted: '2018-08-04',
      });

      await factory.create('subscription-billing', {
        userId: user.id,
        start: moment(dueDate).startOf('month'),
        end: moment(dueDate).endOf('month'),
        billingCycle: moment(dueDate).format('YYYY-MM'),
        dueDate,
      });

      const date = await UserHelper.getNextSubscriptionPaymentDate(user, '2018-08-04');

      expect(date).to.equal(null);
    });

    it('is null if there is no subscription billing', async () => {
      const user = await factory.create('user');
      const date = await UserHelper.getNextSubscriptionPaymentDate(user, '2018-08-04');

      expect(date).to.equal(null);
    });

    it('is the first day of the next month if the current month is paid', async () => {
      const time = moment();
      const user = await factory.create('user');

      const [billing, payment] = await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
          start: time.clone().startOf('month'),
          end: time.clone().endOf('month'),
          dueDate: time.clone().endOf('month'),
          billingCycle: time.format('YYYY-MM'),
        }),
        factory.create('subscription-payment', {
          userId: user.id,
          status: ExternalTransactionStatus.Completed,
        }),
      ]);

      await billing.addSubscriptionPayment(payment);

      const date = await UserHelper.getNextSubscriptionPaymentDate(user, time);

      expect(date).to.equal(
        time
          .clone()
          .add(1, 'month')
          .startOf('month')
          .format('YYYY-MM-DD'),
      );
    });
  });

  describe('checkIfEmailIsDuplicate', () => {
    it('should throw error if different user', async () => {
      const email = 'test@dave.com';
      await factory.create('user', { id: 1, email });

      let error = null;
      try {
        const userId = 2;
        await UserHelper.checkIfEmailIsDuplicate(email, userId);
      } catch (ex) {
        error = ex;
      }

      expect(error.name).to.equal('AlreadyExistsError');
      expect(error.statusCode).to.equal(409);
    });

    it('should not throw error if same user', async () => {
      const email = 'test@dave.com';
      await factory.create('user', { id: 1, email });

      let error = null;
      try {
        const userId = 1;
        await UserHelper.checkIfEmailIsDuplicate(email, userId);
      } catch (ex) {
        error = ex;
      }

      expect(error).to.equal(null);
    });

    it('should throw error if email exists and user not provided', async () => {
      const email = 'test@dave.com';
      await factory.create('user', { id: 1, email });

      let error = null;
      try {
        await UserHelper.checkIfEmailIsDuplicate(email);
      } catch (ex) {
        error = ex;
      }

      expect(error.name).to.equal('AlreadyExistsError');
      expect(error.statusCode).to.equal(409);
    });

    it('should not throw error if new email', async () => {
      await factory.create('user', { id: 1, email: 'test@dave.com' });

      let error = null;
      try {
        await UserHelper.checkIfEmailIsDuplicate('test2@dave.com');
      } catch (ex) {
        error = ex;
      }

      expect(error).to.equal(null);
    });
  });

  describe('getCoolOffStatus', () => {
    it('should not be cooling off without advances present', async () => {
      const user = await factory.create('user');
      const status = await UserHelper.getCoolOffStatus(user.id);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });

    it('should not be cooling off for a normal advance without any payment', async () => {
      const advance = await factory.create('advance', {
        amount: 25,
        created: moment(),
      });
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });

    it('should be cooling off for same-day debit micro advance', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 24.99,
        created: created.clone().subtract(5, 'second'),
      });
      await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      advance.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      const tomorrow = advance.created.clone().add(1, 'day');
      expect(status.isCoolingOff).to.equal(true);
      expect(status.coolOffDate).to.be.sameMoment(tomorrow);
    });

    it('should not be cooling off for a yesterday debit micro advance and today payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 24.99,
        created: created.clone().subtract(1, 'day'),
      });
      await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });

    it('should be cooling off for three days for a micro advance ACH payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 24.99,
        created,
      });
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });
      payment.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      const threeDaysFromNow = payment.created.clone().add(3, 'days');
      expect(status.isCoolingOff).to.equal(true);
      expect(status.coolOffDate).to.be.sameMoment(threeDaysFromNow);
    });

    it('should be cooling off for three days for a normal advance ACH payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 25,
        created,
      });
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });
      payment.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      const threeDaysFromNow = payment.created.clone().add(3, 'days');
      expect(status.isCoolingOff).to.equal(true);
      expect(status.coolOffDate).to.be.sameMoment(threeDaysFromNow);
    });

    it('should be cooling off for one day for a normal advance debit payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 25,
        created,
      });
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      payment.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      const tomorrow = payment.created.clone().add(1, 'days');
      expect(status.isCoolingOff).to.equal(true);
      expect(status.coolOffDate).to.be.sameMoment(tomorrow);
    });

    it('should not be cooling off one day after a normal advance debit payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 25,
        created,
      });
      await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created: created.clone().subtract(1, 'day'),
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });

    it('should not be cooling off for one day after canceled payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 25,
        created,
      });
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
        status: ExternalTransactionStatus.Canceled,
      });
      await payment.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });

    it('should not be cooling off for one day after canceled advance with and old debit payment', async () => {
      const created = moment().startOf('second');
      const advance = await factory.create('advance', {
        amount: 15,
        created,
        disbursementStatus: ExternalTransactionStatus.Canceled,
      });
      const payment = await factory.create('payment', {
        advanceId: advance.id,
        amount: 12, // Still returns cooldown even though not full amount.
        created: moment().subtract(3, 'days'),
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      await payment.reload();
      const status = await UserHelper.getCoolOffStatus(advance.userId);
      expect(status.isCoolingOff).to.equal(false);
      expect(status.coolOffDate).to.be.null;
    });
  });

  describe('fetchName', () => {
    it('is the name set by the user', async () => {
      const user = await factory.create('user', {
        firstName: 'Jim',
        lastName: 'Bo',
      });

      const { firstName, lastName } = await fetchName(user);

      expect(firstName).to.equal('Jim');
      expect(lastName).to.equal('Bo');
    });

    it('checks for a third party name', async () => {
      const user = await factory.create('user', { firstName: null, lastName: null });

      await ThirdPartyName.create({
        userId: user.id,
        firstName: 'Billy',
        lastName: 'Bob',
      });

      const { firstName, lastName } = await fetchName(user);

      expect(firstName).to.equal('Billy');
      expect(lastName).to.equal('Bob');
    });

    it('checks Twilio', async () => {
      const user = await factory.create('user', { firstName: null, lastName: null });

      sandbox.stub(twilio, 'getName').resolves({
        firstName: 'Ash',
        lastName: 'Ketchum',
      });

      const { firstName, lastName } = await fetchName(user);

      expect(firstName).to.equal('Ash');
      expect(lastName).to.equal('Ketchum');
    });

    it('saves the Twilio name', async () => {
      const user = await factory.create('user', { firstName: null, lastName: null });

      sandbox.stub(twilio, 'getName').resolves({
        firstName: 'Ash',
        lastName: 'Ketchum',
      });

      await fetchName(user);

      const thirdPartyName = await ThirdPartyName.findOne({ where: { userId: user.id } });

      expect(thirdPartyName.firstName).to.equal('Ash');
      expect(thirdPartyName.lastName).to.equal('Ketchum');
    });

    it('does not check Twilio on subsequent calls', async () => {
      const user = await factory.create('user', { firstName: null, lastName: null });

      const stub = sandbox.stub(twilio, 'getName').resolves(null);

      await fetchName(user);
      await fetchName(user);

      sinon.assert.calledOnce(stub);
    });
  });

  describe('findByZendeskInfo', () => {
    const zTicket = {
      id: 1,
      requester_id: 1,
      custom_fields: [{ id: ZENDESK_CUSTOM_FIELD_ID.PHONE_NUMBER, value: '(281) 330-8004' }],
    };

    const zUser = {
      id: 1,
      name: 'Mike Jones',
    };

    it('matches on external id', async () => {
      const user = await factory.create('user');
      const zendeskUser = Object.assign({}, zUser, { external_id: `${user.id}` });

      const matchingUser = await UserHelper.findByZendeskInfo(zendeskUser, zTicket);

      expect(matchingUser.id).to.equal(user.id);
    });

    it('matches on email', async () => {
      const user = await factory.create('user', {
        email: 'mike.jones@gmail.com',
        emailVerified: true,
      });
      const zendeskUser = Object.assign({}, zUser, { email: user.email });

      const matchingUser = await UserHelper.findByZendeskInfo(zendeskUser, zTicket);

      expect(matchingUser.id).to.equal(user.id);
    });

    it('matches on phone number', async () => {
      const user = await factory.create('user', {
        phoneNumber: '+12813308004',
      });

      const matchingUser = await UserHelper.findByZendeskInfo(zUser, zTicket);

      expect(matchingUser.id).to.equal(user.id);
    });

    it('errors if more than one match found on phone number', async () => {
      const phoneNumber = '+12813308004';

      await Promise.all([
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-1`,
          deleted: moment().subtract(1, 'month'),
        }),
        factory.create('user', {
          phoneNumber: `${phoneNumber}-deleted-2`,
          deleted: moment().subtract(1, 'week'),
        }),
      ]);

      await expect(UserHelper.findByZendeskInfo(zUser, zTicket)).to.eventually.be.rejectedWith(
        'Found more than one matching user for phone number',
      );
    });

    it('errors if email match and phone number match are not identical', async () => {
      await Promise.all([
        factory.create('user', {
          phoneNumber: '+12813308004',
        }),
        factory.create('user', {
          email: 'mike.jones@gmail.com',
          emailVerified: true,
        }),
      ]);

      const zendeskUser = Object.assign({}, zUser, { email: 'mike.jones@gmail.com' });

      await expect(
        UserHelper.findByZendeskInfo(zendeskUser, zTicket),
      ).to.eventually.be.rejectedWith('User for phone number and email do not match');
    });
  });

  describe('validateParams', () => {
    beforeEach(() => {
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(true);
    });
    it('should return a validated payload', async () => {
      sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      const userFields = {
        firstName: 'Jeffrey',
        lastName: 'Lee',
        birthdate: '1990-01-02',
        phoneNumber: `${user.phoneNumber}1`,
        addressLine1: '123 Jeffrey Ave',
        addressLine2: 'Unit A',
        city: 'Pasdena',
        state: 'California',
        zipCode: 91111,
        countryCode: 'US',
        defaultBankAccountId: bankAccount.id,
      };

      sandbox.stub(verifyAgent, 'post').returns({
        send: async () => ({
          body: {
            deliverability: SynapsepayDeliverabilityStatus.Deliverable,
            normalized_address: {
              address_street: '123 Jeffrey Ave',
              address_city: 'Pasdena',
              address_subdivision: 'California',
              address_postal_code: 91111,
              address_country_code: userFields.countryCode,
            },
          },
        }),
      });

      const defaultPayload = { ssn: 'encryptedSSN' };
      const validatedPayload = await UserHelper.validateParams(
        user,
        userFields,
        defaultPayload,
        false,
      );
      expect(validatedPayload).to.deep.equal({
        ...defaultPayload,
        ...omit(userFields, ['phoneNumber', 'defaultBankAccountId']),
        birthdate: moment(userFields.birthdate),
      });
    });

    it('should return a validated payload and not call address verification', async () => {
      sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      const userFields = {
        firstName: 'Jeffrey',
        lastName: 'Lee',
        birthdate: '1990-01-02',
        phoneNumber: `${user.phoneNumber}1`,
        addressLine1: '123 Jeffrey Ave',
        addressLine2: 'Unit A',
        city: 'Pasdena',
        state: 'California',
        zipCode: 91111,
        defaultBankAccountId: bankAccount.id,
      };

      const addressVerificationSpy = sandbox.spy(verifyAgent, 'post');
      const defaultPayload = { ssn: 'encryptedSSN' };
      const validatedPayload = await UserHelper.validateParams(
        user,
        userFields,
        defaultPayload,
        true,
      );
      expect(validatedPayload).to.deep.equal({
        ...defaultPayload,
        ...omit(userFields, ['phoneNumber', 'defaultBankAccountId']),
        birthdate: moment(userFields.birthdate),
      });
      sinon.assert.notCalled(addressVerificationSpy);
    });

    it('should omit first/last name and birthdate if they do not pass validation', async () => {
      const userFields = { firstName: 'Jeffrey', lastName: 'Lee', birthdate: '1990-01-01' };
      const user = await factory.create('user', userFields);
      const defaultPayload = { ssn: 'encryptedSSN' };
      const validatedPayload = await UserHelper.validateParams(
        user,
        userFields,
        defaultPayload,
        false,
      );
      expect(validatedPayload).to.deep.equal(defaultPayload);
    });

    it('should throw an error for an incomplete address', async () => {
      const userFields = { addressLine1: '123 Jeffrey Ave' };
      const user = await factory.create('user');
      const defaultPayload = { ssn: 'encryptedSSN' };

      let isSuccess;
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INCOMPLETE_ADDRESS);
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should of errored');
      }
    });

    it('should throw an error for under age user', async () => {
      const userFields = { birthdate: '2002-10-02' };
      const user = await factory.create('user');
      const defaultPayload = { ssn: 'encryptedSSN' };

      let isSuccess;
      const clock = sandbox.useFakeTimers(new Date(2020, 9, 1).getTime()); // 9 means October
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_LESS_THAN_18);
      } finally {
        clock.restore();
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should of errored');
      }
    });

    it('should allow on 18 years old birth day', async () => {
      const userFields = { birthdate: '2002-10-01' };
      const user = await factory.create('user');
      const defaultPayload = { ssn: 'encryptedSSN' };

      const clock = sandbox.useFakeTimers(new Date(2020, 9, 1).getTime()); // 9 means October
      await UserHelper.validateParams(user, userFields, defaultPayload, false); // should not throw any error
      clock.restore();
    });

    it('should throw an error for an undeliverable address', async () => {
      const userFields = {
        addressLine1: '123 Jeffrey Ave',
        city: 'Pasadena',
        state: 'CA',
        zipCode: 91111,
      };
      const user = await factory.create('user');
      const defaultPayload = { ssn: 'encryptedSSN' };

      sandbox.stub(verifyAgent, 'post').returns({
        send: async () => ({
          body: {
            deliverability: SynapsepayDeliverabilityStatus.GoogleUndeliverable,
            deliverability_analysis: {
              partial_valid: false,
              primary_number_invalid: false,
              primary_number_missing: false,
              secondary_invalid: false,
              secondary_missing: false,
            },
          },
        }),
      });

      let isSuccess;
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS);
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should of errored');
      }
    });

    it('should throw an error for a phone number that already belongs to a user', async () => {
      const user = await factory.create('user');
      const userFields = { phoneNumber: user.phoneNumber };
      const defaultPayload = { ssn: 'encryptedSSN' };

      let isSuccess;
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(409);
        expect(error.message).to.equal('NewPhoneNumberAlreadyUsed'); // value of error key BEFORE the middleware translates it
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should of errored');
      }
    });

    it('should throw an error if no bank account is found with the id', async () => {
      const user = await factory.create('user');
      const defaultBankAccountId = '451345fsared';
      const userFields = { defaultBankAccountId };
      const defaultPayload = { ssn: 'encryptedSSN' };

      let isSuccess;
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(404);
        expect(error.message).to.equal('BankAccountNotFoundById');
        expect(error.interpolations.bankAccountId).to.equal(defaultBankAccountId);
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should of errored');
      }
    });

    it('should throw an error for a Dave Banking user with an invalid address', async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const userFields = {
        firstName: 'Alice',
        lastName: 'Andbob',
        addressLine1: 'PO Box 123',
        city: 'Pasadena',
        state: 'California',
        zipCode: 91111,
        countryCode: 'US',
        defaultBankAccountId: bankAccount.id,
      };

      sandbox.stub(verifyAgent, 'post').returns({
        send: async () => ({
          body: {
            deliverability: SynapsepayDeliverabilityStatus.Deliverable,
            normalized_address: {
              address_street: 'PO Box 123',
              address_city: 'Pasadena',
              address_subdivision: 'California',
              address_postal_code: 91111,
              address_country_code: userFields.countryCode,
            },
          },
        }),
      });

      try {
        await UserHelper.validateParams(user, userFields, {}, false);
        expect.fail();
      } catch (error) {
        expect(error.message).to.equal('The address cannot be a P.O. Box.');
        expect(error.statusCode).to.equal(400);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_ADDRESS);
      }
    });

    it('should deny a user to update address within 90 days of a passed kyc', async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      const userFields = {
        addressLine1: '123 Main Street',
        city: 'Pasadena',
        state: 'California',
        zipCode: 91111,
        countryCode: 'US',
        defaultBankAccountId: bankAccount.id,
      };

      sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(moment());

      try {
        await UserHelper.validateParams(user, userFields, {}, true);
      } catch (error) {
        expect(error.statusCode).to.equal(403);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_DENY_UPDATE_ADDRESS);
      }
    });

    it('should allow a PO box for a non-Dave Banking user', async () => {
      sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
      const bankAccount = await factory.create('bank-account');
      const user = await User.findByPk(bankAccount.userId);
      const userFields = {
        firstName: 'Alice',
        lastName: 'Andbob',
        addressLine1: 'PO Box 123',
        city: 'Pasadena',
        state: 'California',
        zipCode: 91111,
        countryCode: 'US',
        defaultBankAccountId: bankAccount.id,
      };

      sandbox.stub(verifyAgent, 'post').returns({
        send: async () => ({
          body: {
            deliverability: SynapsepayDeliverabilityStatus.Deliverable,
            normalized_address: {
              address_street: 'PO Box 123',
              address_city: 'Pasadena',
              address_subdivision: 'California',
              address_postal_code: 91111,
              address_country_code: userFields.countryCode,
            },
          },
        }),
      });

      const validatedPayload = await UserHelper.validateParams(user, userFields, {}, false);
      expect(validatedPayload.addressLine1).to.equal('PO Box 123');
    });

    it('should throw an error for an invalid email', async () => {
      const userFields = { email: 'keithgo dchaux@dead.net' };
      const user = await factory.create('user');
      const defaultPayload = { ssn: 'encryptedSSN' };

      let isSuccess;
      try {
        await UserHelper.validateParams(user, userFields, defaultPayload, false);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(400);
        expect(error.message).to.equal('InvalidEmailEntry');
      }

      if (isSuccess) {
        throw new Error('validateParams succeeded, but should have errored');
      }
    });
  });

  describe('verifyUserIdentity', () => {
    beforeEach(() => {
      stubBankTransactionClient(sandbox);
      return up();
    });

    it('should fail on identity is invalid', async () => {
      const userId = 1000;
      const user = await User.findByPk(userId);
      const isAdmin = false;
      const auditLog = false;
      const { error } = await verifyUserIdentity(user, { isAdmin, auditLog });
      expect(error).to.equal('Identity verification process failed');
    });

    it('should fail if identity has not been verified', async () => {
      const userId = 1;
      const user = await User.findByPk(userId);
      const isAdmin = false;
      const auditLog = false;
      const { error } = await verifyUserIdentity(user, { isAdmin, auditLog });
      expect(error).to.equal('Identity verification is required to take out an advance');
    });

    it('should fail with identity review in progress', async () => {
      const userId = 901;
      await sequelize.query(
        'UPDATE synapsepay_document SET ssn_status = "REVIEWING" WHERE user_id = ?',
        { replacements: [userId] },
      );
      const user = await User.findByPk(userId);
      const isAdmin = false;
      const auditLog = false;
      const { error } = await verifyUserIdentity(user, { isAdmin, auditLog });
      expect(error).to.equal('Identity documents are still under review');
    });

    it('should fail with license upload required', async () => {
      const userId = 901;
      await sequelize.query(
        'UPDATE synapsepay_document SET ssn_status = "INVALID" WHERE user_id = ?',
        { replacements: [userId] },
      );
      const user = await User.findByPk(userId);
      const isAdmin = false;
      const auditLog = false;
      const { error } = await verifyUserIdentity(user, { isAdmin, auditLog });
      expect(error).to.equal('Please upload license');
    });

    it('should fail on closed permissions', async () => {
      const user = await factory.create<User>('user');
      const [document] = await Promise.all([
        factory.create<SynapsepayDocument>('synapsepay-document', {
          permission: SynapsepayDocumentPermission.Closed,
          ssnStatus: SynapsepayDocumentSSNStatus.Valid,
          licenseStatus: SynapsepayDocumentLicenseStatus.Valid,
          sanctionsScreeningMatch: false,
          userId: user.id,
        }),
        factory.create<BankConnection>('bank-connection', {
          bankingDataSource: BankingDataSource.BankOfDave,
          userId: user.id,
        }),
      ]);

      await user.update({ synapsepayId: document.synapsepayUserId });

      const { success } = await verifyUserIdentity(user);

      expect(success).to.equal(false);
    });
  });

  describe('getVerificationInfo', () => {
    beforeEach(() => {
      sandbox.stub(SynapsepayLib, 'deleteSynapsePayUser').resolves();
    });

    it('should return proper values if it is admin override', async () => {
      const user = await factory.create('user');
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      const verificationInfo = await UserHelper.getVerificationInfo(user, false);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: true,
      });
    });

    it('should return proper values if only password is set', async () => {
      const user = await factory.create('user');
      await user.setPassword('ChocolatePeppermintCherryMocha1!');

      const verificationInfo = await UserHelper.getVerificationInfo(user, false);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: true,
      });
    });

    it('should return proper values and send create password email if only email set', async () => {
      const user = await factory.create('user', {
        email: 'blahblahblah@wahwah.com',
        emailVerified: true,
      });
      const sendgridStub = sandbox.stub(sendgrid, 'send').resolves();

      const verificationInfo = await UserHelper.getVerificationInfo(user, false);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: true,
        hasCreatedPassword: false,
        email: 'b****h@wahwah.com',
      });
      sinon.assert.calledOnce(sendgridStub);
    });

    it('should return proper values if email and password are set', async () => {
      const user = await factory.create('user', { email: 'user@dave.com' });
      await user.setPassword('ChocolatePeppermintCherryMocha1!');

      const verificationInfo = await UserHelper.getVerificationInfo(user, false);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: true,
        hasCreatedPassword: true,
      });
    });

    it('should return proper values and not send email during sign up if only email set', async () => {
      const user = await factory.create('user', {
        email: 'blahblahblah@wahwah.com',
        emailVerified: true,
      });
      const sendgridSpy = sandbox.spy(sendgrid, 'send');

      const verificationInfo = await UserHelper.getVerificationInfo(user, true);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: true,
        hasCreatedPassword: false,
        email: 'b****h@wahwah.com',
      });
      sinon.assert.notCalled(sendgridSpy);
    });

    it('should return proper values and send code if contract has not changed and is not sign up', async () => {
      const user = await factory.create('user', { phoneNumber: '+11234567890' });
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      sandbox.stub(twilio, 'checkForContractChange').resolves(false);
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const amplitudeStub = sandbox.stub(amplitude, 'track');
      const verificationInfo = await UserHelper.getVerificationInfo(user, false);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: false,
        hasTwilioContractChanged: false,
      });
      sinon.assert.calledOnce(sendStub);
      sinon.assert.calledOnce(amplitudeStub);
      sinon.assert.calledWith(
        datadogStub,
        'phone_number_verification.check_for_contract_change.false',
        sinon.match({ is_sign_up: 'false', forgot_password: 'false' }),
      );
    });

    it('should return proper values, remove user and send code if contract has changed and is sign up', async () => {
      const user = await factory.create('user');
      const userId = user.id;
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      sandbox.stub(twilio, 'checkForContractChange').resolves(true);
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const amplitudeStub = sandbox.stub(amplitude, 'track');

      const verificationInfo = await UserHelper.getVerificationInfo(user, true);
      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: false,
        hasTwilioContractChanged: true,
      });
      sinon.assert.calledOnce(sendStub);

      const deletedUser = await User.findByPk(userId, { paranoid: false });
      expect(deletedUser.isSoftDeleted()).to.be.true;
      sinon.assert.calledOnce(amplitudeStub);
      sinon.assert.calledWith(
        datadogStub,
        'phone_number_verification.check_for_contract_change.true',
        sinon.match({ is_sign_up: 'true', forgot_password: 'false' }),
      );
    });

    it('should return proper values and send code if forgotPassword=true and contract change=false', async () => {
      const user = await factory.create('user');
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      sandbox.stub(twilio, 'checkForContractChange').resolves(false);
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const amplitudeStub = sandbox.stub(amplitude, 'track');

      const forgotPassword = true;
      const isSignUp = false;
      const verificationInfo = await UserHelper.getVerificationInfo(user, isSignUp, forgotPassword);

      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: false,
        hasTwilioContractChanged: false,
      });
      sinon.assert.calledOnce(sendStub);
      sinon.assert.calledOnce(amplitudeStub);
      sinon.assert.calledWith(
        datadogStub,
        'phone_number_verification.check_for_contract_change.false',
        sinon.match({
          is_sign_up: isSignUp.toString(),
          forgot_password: forgotPassword.toString(),
        }),
      );
    });

    it('should return proper values, send code, and delete user if forgotPassword=true and contract change=true', async () => {
      const user = await factory.create('user');
      const sendStub = sandbox.stub(phoneNumberVerification, 'send').resolves();
      sandbox.stub(twilio, 'checkForContractChange').resolves(true);
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const amplitudeStub = sandbox.stub(amplitude, 'track');
      const isSignUp = false;
      const forgotPassword = true;

      const verificationInfo = await UserHelper.getVerificationInfo(user, isSignUp, forgotPassword);
      const deletedUser = await User.findByPk(user.id, { paranoid: false });

      expect(verificationInfo).to.deep.equal({
        hasProvidedEmailAddress: false,
        hasCreatedPassword: false,
        hasTwilioContractChanged: true,
      });
      expect(deletedUser.isSoftDeleted()).to.be.true;
      sinon.assert.calledOnce(sendStub);
      sinon.assert.calledOnce(amplitudeStub);
      sinon.assert.calledWith(
        datadogStub,
        'phone_number_verification.check_for_contract_change.true',
        sinon.match({
          is_sign_up: isSignUp.toString(),
          forgot_password: forgotPassword.toString(),
        }),
      );
    });
  });

  describe('verifyUserPassword', () => {
    it('should throw an invalid credentials error if bcrypt errors out because password is null', async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');

      let isSuccess;
      try {
        await UserHelper.verifyUserPassword(user, null, 3);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(401);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
        expect(error.data.attemptsRemaining).to.equal(3);
      }

      if (isSuccess) {
        throw new Error('verifyUserPassword succeeded, but it should of errored');
      }
    });

    it('should throw an invalid credentials error if password does not match', async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');

      let isSuccess;
      try {
        await UserHelper.verifyUserPassword(user, 'wrongPasswordBro', 3);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(401);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
        expect(error.data.attemptsRemaining).to.equal(3);
      }

      if (isSuccess) {
        throw new Error('verifyUserPassword succeeded, but it should of errored');
      }
    });

    it('should throw an invalid credentials error if password does for admin override', async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      let isSuccess;
      try {
        await UserHelper.verifyUserPassword(user, null, 3);
        isSuccess = true;
      } catch (error) {
        expect(error.statusCode).to.equal(401);
        expect(error.customCode).to.equal(CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS);
        expect(error.data.attemptsRemaining).to.equal(3);
      }

      if (isSuccess) {
        throw new Error('verifyUserPassword succeeded, but it should of errored');
      }
    });

    it('should return nothing if password matches', async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');

      try {
        const result = await UserHelper.verifyUserPassword(user, 'JeffBestPassword1!', 3);
        expect(result).to.be.undefined;
      } catch (error) {
        throw new Error('verifyUserPassword errored, but it should of succeeded');
      }
    });

    it('should return nothing if password matches during admin override', async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      try {
        const result = await UserHelper.verifyUserPassword(user, 'DaveSaves1111!', 3);
        expect(result).to.be.undefined;
      } catch (error) {
        throw new Error('verifyUserPassword errored, but it should of succeeded');
      }
    });

    it("should return nothing if password matches the user's real password during admin override", async () => {
      const user = await factory.create('user');
      await user.setPassword('JeffBestPassword1!');
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      try {
        const result = await UserHelper.verifyUserPassword(user, 'JeffBestPassword1!', 3);
        expect(result).to.be.undefined;
      } catch (error) {
        throw new Error('verifyUserPassword errored, but it should of succeeded');
      }
    });
  });

  describe('attemptToSetAdminLoginOverrideSession', () => {
    it('should do nothing if admin login override is not set', async () => {
      const userSession = await factory.create('user-session');
      const user = await User.findByPk(userSession.userId);

      await UserHelper.attemptToSetAdminLoginOverrideSession(
        userSession,
        user.phoneNumber,
        'SomeKindaPassword',
      );

      await userSession.reload();
      expect(userSession.adminLoginOverride).to.be.false;
    });

    it('should do nothing if admin login override is set, but the password does not match', async () => {
      const userSession = await factory.create('user-session');
      const user = await User.findByPk(userSession.userId);
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      await UserHelper.attemptToSetAdminLoginOverrideSession(
        userSession,
        user.phoneNumber,
        'SomeOtherPassword1',
      );

      await userSession.reload();
      expect(userSession.adminLoginOverride).to.be.false;
    });

    it('should set user session if admin login override is set and password matches', async () => {
      const userSession = await factory.create('user-session');
      const user = await User.findByPk(userSession.userId);
      await redis.setAsync([
        `adminLogin:${user.phoneNumber}`,
        JSON.stringify({ pin: '1111', password: 'DaveSaves1111!' }),
        'EX',
        '60',
      ]);

      await UserHelper.attemptToSetAdminLoginOverrideSession(
        userSession,
        user.phoneNumber,
        'DaveSaves1111!',
      );

      await userSession.reload();
      expect(userSession.adminLoginOverride).to.be.true;
    });

    it('should set admin login with default params', async () => {
      const redisStub = sandbox.stub(redis, 'setAsync');

      await UserHelper.setAdminLoginOverride('justakey');
      sandbox.assert.calledOnce(redisStub);
      const [keyParams] = redisStub.firstCall.args;
      expect(keyParams.length).to.equal(4);
      expect(keyParams[0]).to.equal('adminLogin:justakey');
      const overrideInfo = JSON.parse(keyParams[1]);
      expect(overrideInfo.password.startsWith('DaveSaves')).to.be.true;
      expect(keyParams[2]).to.equal('EX');
      expect(keyParams[3]).to.equal('60');
    });

    it('should set admin login with override TTL', async () => {
      const redisStub = sandbox.stub(redis, 'setAsync');

      await UserHelper.setAdminLoginOverride('justakey', { ttl: 100 });
      sandbox.assert.calledOnce(redisStub);
      const [keyParams] = redisStub.firstCall.args;
      expect(keyParams.length).to.equal(4);
      expect(keyParams[2]).to.equal('EX');
      expect(keyParams[3]).to.equal('100');
    });

    it('should set admin login with no TTL', async () => {
      const redisStub = sandbox.stub(redis, 'setAsync');

      await UserHelper.setAdminLoginOverride('justakey', { ttl: null });
      sandbox.assert.calledOnce(redisStub);
      const [keyParams] = redisStub.firstCall.args;
      expect(keyParams.length).to.equal(2);
    });

    it('should set admin login with specific password', async () => {
      const redisStub = sandbox.stub(redis, 'setAsync');

      await UserHelper.setAdminLoginOverride('justakey', { pin: 1265, password: 'justapass' });
      sandbox.assert.calledOnce(redisStub);
      const [keyParams] = redisStub.firstCall.args;
      expect(keyParams[0]).to.equal('adminLogin:justakey');
      const overrideInfo = JSON.parse(keyParams[1]);
      expect(overrideInfo.password).to.equal('justapass');
      expect(overrideInfo.pin).to.equal(1265);
    });
  });

  describe('getAllPrimaryBankAccounts', () => {
    it("should fetch a user's bank accounts that are flagged as primary in the bank connection table, excluding unsupported accounts", async () => {
      const user = await factory.create('user');

      const [bankConnectionA, bankConnectionB, bankConnectionC] = await Promise.all([
        factory.create('bank-connection', { userId: user.id }),
        factory.create('bank-connection', { userId: user.id }),
        factory.create('bank-connection', { userId: user.id }),
      ]);

      const [, bankAccountB, bankAccountC, savingsAccount] = await Promise.all([
        factory.create('checking-account', {
          bankConnectionId: bankConnectionA.id,
          userId: user.id,
        }),
        factory.create('checking-account', {
          bankConnectionId: bankConnectionA.id,
          userId: user.id,
        }),
        factory.create('checking-account', {
          bankConnectionId: bankConnectionB.id,
          userId: user.id,
        }),
        factory.create('bank-account', {
          bankConnectionId: bankConnectionA.id,
          userId: user.id,
          subtype: BankAccountSubtype.Savings,
        }),
      ]);

      let primaryBankAccounts = await UserHelper.getAllPrimaryBankAccounts(user.id);

      expect(primaryBankAccounts).length(0);

      await bankConnectionA.update({ primaryBankAccountId: bankAccountB.id });
      await bankConnectionB.update({ primaryBankAccountId: bankAccountC.id });
      await bankConnectionC.update({ primaryBankAccountId: savingsAccount.id });

      primaryBankAccounts = await UserHelper.getAllPrimaryBankAccounts(user.id);

      expect(primaryBankAccounts).length(2);
      expect(primaryBankAccounts.find(({ id }) => id === bankAccountB.id)).to.exist;
      expect(primaryBankAccounts.find(({ id }) => id === bankAccountC.id)).to.exist;
    });
  });

  describe('getAllPrimaryPaymentSources', () => {
    it("should fetch a user's bank accounts that are flagged as primary in the bank connection table, as well as their associated default payment method", async () => {
      const user = await factory.create('user');

      const bankConnectionA = await factory.create('bank-connection', { userId: user.id });
      const bankConnectionB = await factory.create('bank-connection', { userId: user.id });
      const bankConnectionC = await factory.create('bank-connection', { userId: user.id });

      const bankAccountA = await factory.create('checking-account', {
        bankConnectionId: bankConnectionA.id,
        userId: user.id,
      });
      const bankAccountB = await factory.create('checking-account', {
        bankConnectionId: bankConnectionB.id,
        userId: user.id,
      });
      const bankAccountC = await factory.create('bank-account', {
        bankConnectionId: bankConnectionC.id,
        userId: user.id,
        subtype: BankAccountSubtype.Savings,
      });

      const bankAccountDebitCardA = await factory.create('payment-method', {
        bankAccountId: bankAccountA.id,
        userId: user.id,
      });
      const bankAccountDebitCardB = await factory.create('payment-method', {
        bankAccountId: bankAccountB.id,
        userId: user.id,
      });

      await Promise.all([
        bankAccountA.update({ defaultPaymentMethodId: bankAccountDebitCardA.id }),
        bankAccountB.update({ defaultPaymentMethodId: bankAccountDebitCardB.id }),
      ]);

      let primaryPaymentSources = await UserHelper.getAllPrimaryPaymentSources(user.id);

      expect(primaryPaymentSources).length(0);

      await Promise.all([
        bankConnectionA.update({ primaryBankAccountId: bankAccountA.id }),
        bankConnectionB.update({ primaryBankAccountId: bankAccountB.id }),
        bankConnectionC.update({ primaryBankAccountId: bankAccountC.id }),
      ]);

      primaryPaymentSources = await UserHelper.getAllPrimaryPaymentSources(user.id);

      expect(primaryPaymentSources).length(2);
      expect(primaryPaymentSources[0].bankAccount.id).to.equals(bankAccountA.id);
      expect(primaryPaymentSources[0].debitCard.id).to.equals(bankAccountDebitCardA.id);
      expect(primaryPaymentSources[1].bankAccount.id).to.equals(bankAccountB.id);
      expect(primaryPaymentSources[1].debitCard.id).to.equals(bankAccountDebitCardB.id);
    });
  });

  describe('validateNameUpdate', () => {
    it('should return false given the same name with different letter casing', async () => {
      const user = await factory.create('user', { firstName: 'elon', lastName: 'musk' });
      const newFirstName = 'Elon';
      const newLastName = 'Musk';
      const result = await validateNameUpdate(newFirstName, newLastName, user);
      expect(result).to.be.false;
    });

    it('should not error out if name is null or undefined', async () => {
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(true);
      const user = await factory.create('user', { firstName: null, lastName: undefined });
      const firstName = 'Elon';
      const lastName = 'Musk';
      const result = await validateNameUpdate(firstName, lastName, user);
      expect(result).to.be.true;
    });

    it('should allow update if idv is not success and socure not run', async () => {
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(true);

      const user = await factory.create('user', { firstName: 'some', lastName: 'other' });
      const firstName = 'Elon';
      const lastName = 'Musk';
      const result = await validateNameUpdate(firstName, lastName, user);
      expect(result).to.be.true;
    });

    it('should not allow update if idv is success', async () => {
      const spy = sandbox.spy(identityApi, 'hasNeverRunSocureKyc');
      const user = await factory.create('user', {
        firstName: 'some',
        lastName: 'other',
      });
      await factory.create('synapsepay-document', { userId: user.id });

      const firstName = 'Elon';
      const lastName = 'Musk';
      await expect(validateNameUpdate(firstName, lastName, user)).to.be.rejectedWith(
        InvalidParametersError,
      );
      expect(spy.callCount).to.eq(0);
    });

    it('should not allow update if idv is not success and kyc has been run', async () => {
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').resolves(false);
      // in default, verifyUserIdentity will return {success: false}
      const user = await factory.create('user', {
        firstName: 'some',
        lastName: 'other',
      });

      const firstName = 'Elon';
      const lastName = 'Musk';
      await expect(validateNameUpdate(firstName, lastName, user)).to.be.rejectedWith(
        InvalidParametersError,
      );
    });

    it('should throw an upstream error if identity api throws an error', async () => {
      sandbox.stub(identityApi, 'hasNeverRunSocureKyc').rejects(new Error());
      // in default, verifyUserIdentity will return {success: false}
      const user = await factory.create('user', {
        firstName: 'some',
        lastName: 'other',
      });

      const firstName = 'Elon';
      const lastName = 'Musk';
      await expect(validateNameUpdate(firstName, lastName, user)).to.be.rejectedWith(
        GenericUpstreamError,
      );
    });
  });

  describe('sendCreatePasswordEmail', () => {
    let sendgridStub: undefined | Sinon.SinonStub;

    beforeEach(() => {
      sendgridStub = sandbox.stub(sendgrid, 'send');
    });

    it('should send the correct data to sendgrid', async () => {
      await UserHelper.sendCreatePasswordEmail(
        'dave@theforgottenbear.com',
        '+19993054141',
        'Dave DaLostBear',
      );

      expect(sendgridStub.callCount).to.equal(1);
      const actionUrl = new URL(sendgridStub.firstCall.args[2].ACTION_URL);
      const name = sendgridStub.firstCall.args[2].NAME;
      const queryParams = Array.from(actionUrl.searchParams.entries());
      expect(actionUrl.pathname).to.eq('/set-password');
      expect(queryParams.filter(each => each[0] === 'token')).to.be.length(1);
      expect(
        queryParams.filter(each => {
          return each[0] === 'email' && each[1] === 'dave@theforgottenbear.com';
        }),
      ).to.be.length(1);
      expect(queryParams.filter(each => each[0] === 'isResetPassword')).to.be.length(0);
      expect(name).to.eq('Dave DaLostBear');
    });
  });

  describe('sendResetPasswordEmail', () => {
    let sendgridStub: undefined | Sinon.SinonStub;

    beforeEach(() => {
      sendgridStub = sandbox.stub(sendgrid, 'send');
    });

    it('should create an audit log', async () => {
      const spy = sandbox.spy(AuditLog, 'create');
      await UserHelper.sendResetPasswordEmail('dave@theforgottenbear.com', 'Dave DaLostBear');

      expect(spy.callCount).to.eq(1);
      expect(spy.firstCall.args[0].message).to.equal(
        `password reset form sent to email 'dave@theforgottenbear.com'`,
      );
    });

    it('should send the correct data to sendgrid', async () => {
      await UserHelper.sendResetPasswordEmail('dave@theforgottenbear.com', 'Dave DaLostBear');

      expect(sendgridStub.callCount).to.equal(1);
      const actionUrl = new URL(sendgridStub.firstCall.args[2].ACTION_URL);
      const name = sendgridStub.firstCall.args[2].NAME;
      const queryParams = Array.from(actionUrl.searchParams.entries());
      expect(actionUrl.pathname).to.eq('/set-password');
      expect(queryParams.filter(each => each[0] === 'token')).to.be.length(1);
      expect(
        queryParams.filter(each => {
          return each[0] === 'email' && each[1] === 'dave@theforgottenbear.com';
        }),
      ).to.be.length(1);
      expect(
        queryParams.filter(each => {
          return each[0] === 'isResetPassword' && each[1] === 'true';
        }),
      ).to.be.length(1);
      expect(name).to.eq('Dave DaLostBear');
    });
  });

  describe('sendNewDeviceMFACode', () => {
    it('sends mfa code to VoIp numbers', async () => {
      const user = await factory.create('user');
      sandbox
        .stub(twilio, 'getMobileInfo')
        .resolves({ isMobile: false, carrierName: 'T-Mobile', carrierCode: '660' });
      const twilioStub = sandbox.stub(twilio, 'send').resolves();
      await expect(UserHelper.sendNewDeviceMFACode(user)).to.be.fulfilled;
      expect(twilioStub).to.be.calledOnce;
    });
  });

  describe('logModifications', () => {
    it('omits account/routing from payload', async () => {
      const user = await factory.create('user');
      await UserHelper.logModifications({
        modifications: {
          name: {
            previousValue: 'test',
            currentValue: 'Test',
          },
        },
        userId: user.id,
        type: 'TEST',
        requestPayload: {
          account: 123,
          routing: 456,
          test: 'test',
        },
      });

      const auditLog = await AuditLog.findOne({
        where: { userId: user.id },
      });

      const { requestPayload } = auditLog.extra;
      expect(requestPayload.test).to.equal('test');
      expect(requestPayload.account).to.be.undefined;
      expect(requestPayload.routing).to.be.undefined;
    });
  });

  describe('allowAddressUpdate', () => {
    it('returns true if it is disabled', async () => {
      sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
      sandbox
        .stub(Config, 'get')
        .withArgs('risk.addressControl')
        .returns({ addressControlEnabled: false });

      const user = await factory.create<User>('user');
      const result = await isAddressUpdateAllowed(user);
      expect(result.allowAddressUpdate).to.equal(true);
      expect(result.addressUpdateRejectReason).to.be.undefined;
    });

    context('no kyc', () => {
      beforeEach(() => {
        sandbox
          .stub(Config, 'get')
          .withArgs('risk.addressControl')
          .returns({ addressControlEnabled: true });

        sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(null);
      });

      it('return true with one address for last 30 days', async () => {
        const user = await factory.create<User>('user');
        await factory.create<UserAddress>('user-address', { userId: user.id });
        const result = await isAddressUpdateAllowed(user);

        expect(result.allowAddressUpdate).to.equal(true);
        expect(result.addressUpdateRejectReason).to.be.undefined;
      });

      it('return false with three addresses for last 30 days', async () => {
        const user = await factory.create<User>('user');
        await factory.create<UserAddress>('user-address', { userId: user.id });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        const result = await isAddressUpdateAllowed(user);
        expect(result.allowAddressUpdate).to.equal(false);
        expect(result.addressUpdateRejectReason).to.equal(
          AddressUpdateRejectReason.TooManyRecentUpdates,
        );
      });

      it('return true with one address created 30 days ago and two addresses for last 30 days', async () => {
        const user = await factory.create<User>('user');
        await factory.create<UserAddress>('user-address', {
          userId: user.id,
          created: moment().subtract(31, 'days'),
        });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        const result = await isAddressUpdateAllowed(user);
        expect(result.allowAddressUpdate).to.equal(true);
        expect(result.addressUpdateRejectReason).to.be.undefined;
      });
    });

    context('with passed kyc', () => {
      beforeEach(() => {
        sandbox
          .stub(Config, 'get')
          .withArgs('risk.addressControl')
          .returns({ addressControlEnabled: true });
      });

      it('return false if passed kyc within last 90 days', async () => {
        sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(moment().subtract(89, 'days'));
        const user = await factory.create<User>('user');
        const result = await isAddressUpdateAllowed(user);
        expect(result.allowAddressUpdate).to.equal(false);
        expect(result.addressUpdateRejectReason).to.equal(AddressUpdateRejectReason.KycLockPeriod);
      });

      it('return true if passed kyc 90 days ago', async () => {
        const user = await factory.create<User>('user');
        sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(moment().subtract(91, 'days'));
        const result = await isAddressUpdateAllowed(user);
        expect(result.allowAddressUpdate).to.equal(true);
        expect(result.addressUpdateRejectReason).to.be.undefined;
      });

      it('return false if kyc passed 90 days ago and three addresses within last 30 days', async () => {
        const user = await factory.create<User>('user');
        sandbox.stub(identityApi, 'kycPassedCheckedAt').resolves(moment().subtract(91, 'days'));
        await factory.create<UserAddress>('user-address', { userId: user.id });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        await factory.create<UserAddress>('user-address', { userId: user.id });
        const result = await isAddressUpdateAllowed(user);
        expect(result.allowAddressUpdate).to.equal(false);
        expect(result.addressUpdateRejectReason).to.equal(
          AddressUpdateRejectReason.TooManyRecentUpdates,
        );
      });
    });
  });
});
