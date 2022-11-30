import * as Loomis from '@dave-inc/loomis-client';
import { PaymentGateway } from '@dave-inc/loomis-client';
import { PaymentError } from '../../../../src/lib/error';
import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import * as Tabapay from '../../../../src/lib/tabapay';
import { expect } from 'chai';
import { clean, stubLoomisClient, up, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';
import { moment } from '@dave-inc/time-lib';

import * as sinon from 'sinon';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';

describe('POST /admin/reimbursement', () => {
  const sandbox = sinon.createSandbox();
  const adminAttrs = { roleAttrs: { name: 'overdraftAdmin' } };

  before(() => clean());

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  context('when paymentMethodId is sent', () => {
    it('should fail if the payment method is invalid', async () => {
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({ amount: 100, paymentMethodId: 'foobar', userId: 500 }),
        adminAttrs,
      );

      expect(result.status).to.equal(404);
      expect(result.body.message).to.match(/Unable to find payment method/);
    });

    it('allows users with deactivated payment methods to receive disbursements', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        processor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Completed,
        id: '12345',
      });
      const user = await factory.create('user');
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      await paymentMethod.destroy();
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({
            amount: 100,
            userId: user.id,
            paymentMethodId: paymentMethod.id,
            reason: 'Ellierules',
          }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('Ellierules');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    });

    it('should allow soft deleted users with soft deleted bank accounts to receive a standard reimbursement', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        processor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Completed,
        id: '12345',
      });

      const user = await factory.create('user');
      await user.destroy();

      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      await paymentMethod.destroy();

      const bankAccount = await factory.create('bank-account', {
        defaultPaymentMethodId: paymentMethod.id,
        userId: paymentMethod.userId,
      });
      await bankAccount.destroy();

      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({
            amount: 100,
            userId: user.id,
            paymentMethodId: paymentMethod.id,
            reason: 'soft deletes everywhere',
          }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('soft deletes everywhere');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    });

    it('should disburse the reimbursement successfully for a payment method', async () => {
      sandbox.stub(Tabapay, 'disburse').resolves({
        processor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Completed,
        id: '12345',
      });
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({ amount: 100, userId: 500, paymentMethodId: 500, reason: 'HEYO' }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('HEYO');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    });
  });

  context('when bankAccountId is sent', () => {
    it('should fail if the bank account is invalid', async () => {
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({ amount: 100, bankAccountId: 'foobar', userId: 500 }),
        adminAttrs,
      );

      expect(result.status).to.equal(404);
      expect(result.body.message).to.match(/Unable to find bank account/);
    });

    it('should allow users without debit cards to receive disbursements via ACH', async () => {
      const createTransaction = sandbox.stub().resolves({
        status: ExternalTransactionStatus.Completed,
        externalId: '12345',
        processor: ExternalTransactionProcessor.Synapsepay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ createTransaction });
      const bankAccount = await factory.create('bank-account', {
        defaultPaymentMethodId: null,
      });
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({
            amount: 100,
            userId: bankAccount.userId,
            bankAccountId: bankAccount.id,
            reason: 'lack of debit card linked to account',
          }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('lack of debit card linked to account');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    });

    it('allows users with deactivated bank accounts to receive disbursements via ACH', async () => {
      const createTransaction = sandbox.stub().resolves({
        status: ExternalTransactionStatus.Completed,
        externalId: '12345',
        processor: ExternalTransactionProcessor.Synapsepay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ createTransaction });
      const paymentMethod = await factory.create('payment-method');
      const bankAccount = await factory.create('bank-account', {
        defaultPaymentMethodId: paymentMethod.id,
        userId: paymentMethod.userId,
      });
      bankAccount.destroy();
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({
            amount: 100,
            userId: bankAccount.userId,
            bankAccountId: bankAccount.id,
            reason: 'Izzyrules',
          }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('Izzyrules');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    });

    it('should successfuly disburse the reimbursement via ACH', async () => {
      const createTransaction = sandbox.stub().resolves({
        status: ExternalTransactionStatus.Completed,
        externalId: '12345',
        processor: ExternalTransactionProcessor.Synapsepay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ createTransaction });
      const paymentMethod = await factory.create('payment-method');
      const bankAccount = await factory.create('bank-account', {
        defaultPaymentMethodId: paymentMethod.id,
        userId: paymentMethod.userId,
      });
      const result = await withInternalUser(
        request(app)
          .post('/admin/reimbursement')
          .send({
            amount: 100,
            userId: bankAccount.userId,
            bankAccountId: bankAccount.id,
            reason: 'standard delivery',
          }),
        adminAttrs,
      );

      expect(result.status).to.equal(200);
      expect(result.body.reason).to.equal('standard delivery');
      expect(result.body.externalId).to.equal('12345');
      expect(result.body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    });
  });

  it('should fail if the amount is invalid', async () => {
    const result = await withInternalUser(
      request(app)
        .post('/admin/reimbursement')
        .send({ amount: -1 }),
      adminAttrs,
    );

    expect(result.status).to.equal(400);
    expect(result.body.message).to.match(/amount must be between 0 and 200/);
  });

  it('should gracefully handle disbursement failures', async () => {
    sandbox.stub(Tabapay, 'disburse').rejects(new PaymentError('Payment failed'));
    const result = await withInternalUser(
      request(app)
        .post('/admin/reimbursement')
        .send({ amount: 100, userId: 500, paymentMethodId: 500, reason: 'foo' }),
      adminAttrs,
    );

    expect(result.status).to.equal(424);
  });

  it('should disburse the reimbursement successfully', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      processor: ExternalTransactionProcessor.Tabapay,
      status: ExternalTransactionStatus.Completed,
      id: '12345',
    });
    const result = await withInternalUser(
      request(app)
        .post('/admin/reimbursement')
        .send({ amount: 100, userId: 500, paymentMethodId: 500, reason: 'HEYO' }),
      adminAttrs,
    );

    expect(result.status).to.equal(200);
    expect(result.body.reason).to.equal('HEYO');
    expect(result.body.externalId).to.equal('12345');
    expect(result.body.status).to.equal('COMPLETED');
    expect(result.body.externalProcessor).to.equal('TABAPAY');
  });

  it('allows deleted users to receive debit card reimbursements', async () => {
    sandbox.stub(Tabapay, 'disburse').resolves({
      processor: ExternalTransactionProcessor.Tabapay,
      status: ExternalTransactionStatus.Completed,
      id: '12345',
    });

    const deleted = moment().subtract(1, 'day');

    const user = await factory.create('user', { deleted });

    const bankConnection = await factory.create('bank-connection', {
      bankingDataSource: BankingDataSource.Plaid,
      deleted,
      userId: user.id,
    });

    const bankAccount = await factory.create('bank-account', {
      bankConnectionId: bankConnection.id,
      userId: user.id,
      deleted,
    });

    const paymentMethod = await factory.create('payment-method', {
      userId: user.id,
      bankAccountId: bankAccount.id,
      tabapayId: 'foo',
      risepayId: null,
      deleted,
    });

    const result = await withInternalUser(
      request(app)
        .post('/admin/reimbursement')
        .send({
          amount: 100,
          userId: user.id,
          paymentMethodId: paymentMethod.id,
          reason: 'Ellierules',
        }),
      adminAttrs,
    );

    expect(result.status).to.equal(200);
    expect(result.body.reason).to.equal('Ellierules');
    expect(result.body.externalId).to.equal('12345');
    expect(result.body.status).to.equal('COMPLETED');
    expect(result.body.externalProcessor).to.equal('TABAPAY');
  });

  it('allows deleted users to receive ACH reimbursements', async () => {
    const createTransaction = sandbox.stub().resolves({
      status: ExternalTransactionStatus.Completed,
      externalId: '12345',
      processor: ExternalTransactionProcessor.Synapsepay,
    });
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Synapsepay)
      .returns({ createTransaction });

    const deleted = moment().subtract(1, 'day');

    const user = await factory.create('user', { deleted });

    const bankConnection = await factory.create('bank-connection', {
      bankingDataSource: BankingDataSource.Plaid,
      deleted,
      userId: user.id,
    });

    const bankAccount = await factory.create('bank-account', {
      bankConnectionId: bankConnection.id,
      userId: user.id,
      deleted,
    });

    const paymentMethod = await factory.create('payment-method', {
      userId: user.id,
      bankAccountId: bankAccount.id,
      tabapayId: 'foo',
      risepayId: null,
      deleted,
    });

    await bankAccount.update({
      defaultPaymentMethodId: paymentMethod.id,
    });

    const result = await withInternalUser(
      request(app)
        .post('/admin/reimbursement')
        .send({
          amount: 100,
          userId: user.id,
          bankAccountId: bankAccount.id,
          reason: 'Paras wuz here',
        }),
      adminAttrs,
    );

    expect(result.status).to.equal(200);
    expect(result.body.reason).to.equal('Paras wuz here');
    expect(result.body.externalId).to.equal('12345');
    expect(result.body.status).to.equal('COMPLETED');
    expect(result.body.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
  });
});
