import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { BigNumber } from 'bignumber.js';

import app from '../../../src/services/loomis-api';

import * as ACHCharge from '../../../src/domain/collection/charge-bank-account';
import * as DebitCharge from '../../../src/lib/tabapay';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { AdvanceCollectionTrigger, PaymentProviderTransactionType } from '../../../src/typings';
import { CUSTOM_ERROR_CODES, PaymentProcessorError } from '../../../src/lib/error';
import { Advance, AdvanceCollectionAttempt, Payment, PaymentMethod } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import * as TabapayACHExperiment from '../../../src/experiments/tabapay-ach';

describe('Loomis API', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('Failure POST /payment', () => {
    let advance: Advance;

    beforeEach(async () => {
      const user = await factory.create('user');
      advance = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId: advance.id, amount: 0 });
    });

    it('should return Invalid Parameters Error for an illformed payment method Id', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          paymentMethodId: 'sdghauweasjhga',
          advanceId: advance.id,
          amount: -2500,
          referenceId: 'hellothere',
        })
        .expect(400)
        .catch(error => {
          expect(error.name).to.equal('InvalidParametersError');
          expect(error.message).to.equal('Must include a valid payment method Id');
        });
    });

    it('should return Invalid Parameters Error for a missing reference Id', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId: advance.id,
          amount: -2500,
          paymentMethodId: 'DEBIT:12345',
        })
        .expect(400)
        .catch(error => {
          expect(error.name).to.equal('InvalidParametersError');
          expect(error.message).to.equal('Must include a valid reference Id');
        });
    });

    it('should return Invalid Parameters Error for an invalid reference Id', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId: advance.id,
          amount: -2500,
          paymentMethodId: 'DEBIT:12345',
          referenceId: 'hellotherepurplepenguinonaparaglider',
        })
        .expect(400)
        .catch(error => {
          expect(error.name).to.equal('InvalidParametersError');
          expect(error.message).to.equal('Must include a valid reference Id');
        });
    });

    it('should return Invalid Parameters Error for a missing advance Id', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          amount: -2500,
          paymentMethodId: 'DEBIT:12345',
          referenceId: 'hellothere',
        })
        .expect(400)
        .catch(error => {
          expect(error.name).to.equal('InvalidParametersError');
          expect(error.message).to.equal('Must include an advance Id');
        });
    });

    it('should return Not Implemented Error for amounts over 0', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId: advance.id,
          amount: 2500,
          paymentMethodId: 'DEBIT:12345',
          referenceId: 1234567,
        })
        .expect(500)
        .catch(error => {
          expect(error.name).to.equal('NotImplementedError');
          expect(error.message).to.equal('Cannot disburse funds');
        });
    });

    it('should return Not Found Error for a missing payment method', async () => {
      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          paymentMethodId: 'DEBIT:12345',
          advanceId: advance.id,
          amount: -2500,
          referenceId: 1234567,
        })
        .expect(404)
        .catch(error => {
          expect(error.name).to.equal('NotFoundError');
          expect(error.message).to.equal('Missing provided payment method');
        });
    });

    it('should return Not Found Error for a missing bank account', async () => {
      await request(app)
        .post('/services/loomis_api/payment/BANK:12345')
        .send({
          advanceId: advance.id,
          amount: -2500,
          referenceId: 1234567,
        })
        .expect(404)
        .catch(error => {
          expect(error.name).to.equal('NotFoundError');
          expect(error.message).to.equal('Missing provided bank account');
        });
    });

    it('should return ExternalTransactionError for unexpected ACH charge error', async () => {
      const amount = -2500;
      const referenceId = 'a1b2c3d4e5';

      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });
      const { id: advanceId } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      sandbox.stub(ACHCharge, 'retrieve').rejects(new Error('Unknown Error'));

      const response = await request(app)
        .post('/services/loomis_api/payment')
        .send({ amount, paymentMethodId: `BANK:${bankAccount.id}`, referenceId, advanceId })
        .expect(502);

      expect(response.body.data.originalError.message).to.equal('Unknown Error');
      expect(response.body.data.transaction.referenceId).to.equal(referenceId);
    });

    it('should record a payment and return a response if Tabapay declines the card', async () => {
      const amount = -2576;
      const expectedAmount = 25.76;
      const referenceId = 'a1b2c3d4e5';

      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      const tabapayStub = sandbox.stub(DebitCharge, 'retrieve').throws(
        new PaymentProcessorError(
          'Card entry declined. Please check that your debit card information is correct and try again.',
          'ZZ',
          {
            customCode: CUSTOM_ERROR_CODES.BANK_DENIED_CARD,
          },
        ),
      );

      const response = await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `DEBIT:${paymentMethod.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });

      const updatedAdvance = await Advance.findByPk(advanceId);
      const tabapayArgs = tabapayStub.firstCall.args;

      expect(tabapayArgs[0]).to.equal(referenceId);
      expect(tabapayArgs[1]).to.equal(paymentMethod.tabapayId);
      expect(tabapayArgs[2]).to.equal(expectedAmount);
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.userId).to.equal(user.id);
      expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(payment.paymentMethodId).to.equal(paymentMethod.id);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
      expect(updatedAdvance.outstanding).to.equal(originalOutstanding);

      expect(response.body.outcome).to.deep.equal({ code: 'ZZ' });
    });

    it('should record a payment, invalidate the card, and return a response if Tabapay says the debit card is declined', async () => {
      const amount = -2576;
      const expectedAmount = 25.76;
      const referenceId = 'a1b2c3d4e5';

      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      const tabapayStub = sandbox.stub(DebitCharge, 'retrieve').throws(
        new PaymentProcessorError(
          'Card entry declined. Please check that your debit card information is correct and try again.',
          '14',
          {
            customCode: CUSTOM_ERROR_CODES.BANK_DENIED_CARD,
          },
        ),
      );

      const response = await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `DEBIT:${paymentMethod.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });
      const invalidatedPaymentMethod = await PaymentMethod.findByPk(paymentMethod.id, {
        paranoid: false,
      });
      const updatedAdvance = await Advance.findByPk(advanceId);
      const tabapayArgs = tabapayStub.firstCall.args;

      expect(tabapayArgs[0]).to.equal(referenceId);
      expect(tabapayArgs[1]).to.equal(paymentMethod.tabapayId);
      expect(tabapayArgs[2]).to.equal(expectedAmount);
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.userId).to.equal(user.id);
      expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(payment.paymentMethodId).to.equal(paymentMethod.id);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
      expect(updatedAdvance.outstanding).to.equal(originalOutstanding);
      expect(!!invalidatedPaymentMethod.invalid).to.equal(true);
      expect(invalidatedPaymentMethod.invalidReasonCode).to.equal('14');

      expect(response.body.outcome).to.deep.equal({ code: '14' });
    });
  });

  describe('Success POST /payment', () => {
    const amount = -2576;
    const expectedAmount = 25.76;
    const referenceId = 'a1b2c3d4e5';

    it('should create a payment through Tabapay', async () => {
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      const tabapayStub = sandbox.stub(DebitCharge, 'retrieve').resolves({
        id: 'debit-external-id',
        status: ExternalTransactionStatus.Pending,
      });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `DEBIT:${paymentMethod.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });
      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      const updatedAdvance = await Advance.findByPk(advanceId);
      const tabapayArgs = tabapayStub.firstCall.args;

      expect(tabapayArgs[0]).to.equal(referenceId);
      expect(tabapayArgs[1]).to.equal(paymentMethod.tabapayId);
      expect(tabapayArgs[2]).to.equal(expectedAmount);
      expect(collectionAttempt.amount).to.equal(expectedAmount);
      expect(collectionAttempt.trigger).to.equal(AdvanceCollectionTrigger.TIVAN);
      expect(collectionAttempt.processing).to.be.false;
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.userId).to.equal(user.id);
      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.paymentMethodId).to.equal(paymentMethod.id);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
      expect(payment.externalId).to.equal('debit-external-id');
      expect(updatedAdvance.outstanding).to.equal(
        new BigNumber(originalOutstanding).minus(new BigNumber(expectedAmount)).toNumber(),
      );
    });

    it('should create a payment through Synapsepay', async () => {
      const user = await factory.create('user');
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });

      const retrieveStub = sandbox
        .stub(ACHCharge, 'retrieve')
        .resolves({ id: 'fake-external-id', status: ExternalTransactionStatus.Pending });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `BANK:${bankAccount.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });
      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      const updatedAdvance = await Advance.findByPk(advanceId);
      const retrieveArgs = retrieveStub.firstCall.args;

      expect(retrieveArgs[0].id).to.equal(bankAccount.id);
      expect(retrieveArgs[1]).to.equal(referenceId);
      expect(retrieveArgs[2].id).to.equal(user.id);
      expect(retrieveArgs[3]).to.equal(ExternalTransactionProcessor.Synapsepay);
      expect(retrieveArgs[4]).to.equal(expectedAmount);
      expect(collectionAttempt.amount).to.equal(expectedAmount);
      expect(collectionAttempt.trigger).to.equal(AdvanceCollectionTrigger.TIVAN);
      expect(collectionAttempt.processing).to.be.false;
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
      expect(payment.externalId).to.equal('fake-external-id');
      expect(updatedAdvance.outstanding).to.equal(
        new BigNumber(originalOutstanding).minus(new BigNumber(expectedAmount)).toNumber(),
      );
    });

    it.skip('should create a payment through Tabapay ACH', async () => {
      sandbox.stub(TabapayACHExperiment, 'useTabapayRepaymentsACH').returns(true);
      const user = await factory.create('user');
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });

      const retrieveStub = sandbox
        .stub(ACHCharge, 'retrieve')
        .resolves({ id: 'fake-external-id', status: ExternalTransactionStatus.Pending });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `BANK:${bankAccount.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });
      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      const updatedAdvance = await Advance.findByPk(advanceId);
      const retrieveArgs = retrieveStub.firstCall.args;

      expect(retrieveArgs[0].id).to.equal(bankAccount.id);
      expect(retrieveArgs[1]).to.equal(referenceId);
      expect(retrieveArgs[2].id).to.equal(user.id);
      expect(retrieveArgs[3]).to.equal(ExternalTransactionProcessor.TabapayACH);
      expect(retrieveArgs[4]).to.equal(expectedAmount);
      expect(collectionAttempt.amount).to.equal(expectedAmount);
      expect(collectionAttempt.trigger).to.equal(AdvanceCollectionTrigger.TIVAN);
      expect(collectionAttempt.processing).to.be.false;
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.TabapayACH);
      expect(payment.externalId).to.equal('fake-external-id');
      expect(updatedAdvance.outstanding).to.equal(
        new BigNumber(originalOutstanding).minus(new BigNumber(expectedAmount)).toNumber(),
      );
    });

    it('should create a payment through Bank of Dave', async () => {
      const user = await factory.create('user');
      const { id: advanceId, outstanding: originalOutstanding } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: user.id,
      });

      const retrieveStub = sandbox
        .stub(ACHCharge, 'retrieve')
        .resolves({ id: 'fake-external-id', status: ExternalTransactionStatus.Pending });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `DAVE:${bankAccount.id}`, referenceId })
        .expect(200);

      const payment = await Payment.findOne({
        where: {
          referenceId,
        },
      });
      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      const updatedAdvance = await Advance.findByPk(advanceId);
      const retrieveArgs = retrieveStub.firstCall.args;

      expect(retrieveArgs[0].id).to.equal(bankAccount.id);
      expect(retrieveArgs[1]).to.equal(referenceId);
      expect(retrieveArgs[2].id).to.equal(user.id);
      expect(retrieveArgs[3]).to.equal(ExternalTransactionProcessor.BankOfDave);
      expect(retrieveArgs[4]).to.equal(expectedAmount);
      expect(retrieveArgs[5]).to.deep.equal({
        transactionType: PaymentProviderTransactionType.AdvancePayment,
      });
      expect(collectionAttempt.amount).to.equal(expectedAmount);
      expect(collectionAttempt.trigger).to.equal(AdvanceCollectionTrigger.TIVAN);
      expect(collectionAttempt.processing).to.be.false;
      expect(payment.advanceId).to.equal(advanceId);
      expect(payment.amount).to.equal(expectedAmount);
      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.externalId).to.equal('fake-external-id');
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.BankOfDave);
      expect(updatedAdvance.outstanding).to.equal(
        new BigNumber(originalOutstanding).minus(new BigNumber(expectedAmount)).toNumber(),
      );
    });

    it('should fail to create a payment if there is an active advance collection attempt', async () => {
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      await AdvanceCollectionAttempt.create({
        advanceId,
        amount,
        trigger: AdvanceCollectionTrigger.TIVAN,
      });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({ advanceId, amount, paymentMethodId: `DEBIT:${paymentMethod.id}`, referenceId })
        .expect(409);
    });

    it('should fail to create a payment if the outstanding amount is less than the payment amount', async () => {
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId } = await factory.create('advance', {
        userId: user.id,
        amount: 50,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });
      await factory.create('payment', {
        advanceId,
        amount: 30,
        status: 'COMPLETED',
      });
      const newPaymentAmount = -5000;

      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId,
          amount: newPaymentAmount,
          paymentMethodId: `DEBIT:${paymentMethod.id}`,
          referenceId,
        })
        .expect(424);

      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      expect(collectionAttempt.processing).to.be.false;
    });

    it('should associate AdvanceCollectionAttempt with payment even on failure', async () => {
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      sandbox.stub(DebitCharge, 'retrieve').rejects('some error');

      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId,
          amount,
          paymentMethodId: `DEBIT:${paymentMethod.id}`,
          referenceId,
        })
        .expect(200);

      const aca = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      expect(aca.paymentId).to.exist;
      expect(aca.processing).to.be.false;
    });

    it('should set given trigger in AdvanceCollectionAttempt', async () => {
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const { id: advanceId } = await factory.create('advance', {
        userId: user.id,
      });
      await factory.create('advance-tip', { advanceId, amount: 0 });

      sandbox.stub(DebitCharge, 'retrieve').resolves({
        id: 'debit-external-id',
        status: ExternalTransactionStatus.Pending,
      });

      await request(app)
        .post('/services/loomis_api/payment')
        .send({
          advanceId,
          amount,
          paymentMethodId: `DEBIT:${paymentMethod.id}`,
          referenceId,
          trigger: 'some-trigger',
        })
        .expect(200);

      const collectionAttempt = await AdvanceCollectionAttempt.findOne({
        where: {
          advanceId,
        },
      });
      expect(collectionAttempt.trigger).to.equal('some-trigger');
      expect(collectionAttempt.processing).to.be.false;
    });
  });
});
