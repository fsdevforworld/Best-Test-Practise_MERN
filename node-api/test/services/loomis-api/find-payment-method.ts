import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import factory from '../../factories';
import { BankAccount, PaymentMethod } from '../../../src/models';
import { paymentMethodModelToType } from '../../../src/typings';

describe('Loomis Find Payment Method API', () => {
  before(() => clean());

  it('should return null when no payment method exists', async () => {
    await request(app)
      .get('/services/loomis_api/payment_method_details')
      .query({ id: 12345 })
      .send()
      .expect(200)
      .then(response => expect(response.body).to.be.null);
  });

  it('should return a payment method by payment method id', async () => {
    const bankAccount = await factory.create('bank-account');
    const { id } = await factory.create('payment-method', {
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
      bankAccountId: bankAccount.id,
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ id })
      .send()
      .expect(200)
      .then(response => {
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod));
        expect(response.body.bankAccount.institutionId).to.equal(bankAccount.institutionId);
      });
  });

  it('should return a payment method by user id', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ userId: user.id })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a payment method by payment method id and user id', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ id, userId: user.id })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a payment method by user id where empyr card ID is null', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ userId: user.id, empyrCardIdIsNull: true })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a payment method by user id where empyr card ID is not null', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: 111222333,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ userId: user.id, empyrCardId: paymentMethod.empyrCardId })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a payment method by user id where mask is not null', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ userId: user.id, mask: paymentMethod.mask })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a payment method by user id where empyr card ID and mask are not null', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: 111222333,
      mask: 1234,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    const paymentMethod = paymentMethodModelToType(debitCard);

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ userId: user.id, mask: paymentMethod.mask, empyrCardId: paymentMethod.empyrCardId })
      .send()
      .expect(200)
      .then(response =>
        expect(JSON.stringify(response.body)).to.equal(JSON.stringify(paymentMethod)),
      );
  });

  it('should return a deleted payment method when using includeSoftDeleted flag', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    await debitCard.destroy();

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ id, includeSoftDeleted: true })
      .send()
      .expect(200)
      .then(response => expect(!!response.body.deleted).to.be.true);
  });

  it('should NOT return a deleted payment method when NOT using includeSoftDeleted flag', async () => {
    const user = await factory.create('user');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });
    await debitCard.destroy();

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ id })
      .send()
      .expect(200)
      .then(response => expect(response.body).to.be.null);
  });

  it('should return null when ID is null', async () => {
    const user = await factory.create('user');
    await factory.create('payment-method', {
      userId: user.id,
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });

    await request(app)
      .get(`/services/loomis_api/payment_method_details`)
      .query({ id: null })
      .send()
      .expect(200)
      .then(response => expect(response.body).to.be.null);
  });
});
