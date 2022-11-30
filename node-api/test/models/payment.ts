import { expect } from 'chai';
import factory from '../factories';
import { clean } from '../test-helpers';
import { Payment } from '../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { sequelize } from '../../src/models';

describe('Model: Payment', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('modifications', () => {
    it('records fields that are updated', async () => {
      const payment = await factory.create('payment', { amount: 20 });

      await payment.update({ amount: 25 });

      await payment.reload();

      expect(payment.modifications[0].current.amount).to.equal(25);
      expect(payment.modifications[0].previous.amount).to.equal(20);
    });

    it('does not record webhook data', async () => {
      const payment = await factory.create('payment', { amount: 20 });

      await payment.update({ webhookData: [{ bacon: 'cow' }] });

      await payment.reload();

      expect(payment.modifications).to.equal(null);
    });

    it('does not record fields that are not updated', async () => {
      const payment = await factory.create('payment', { amount: 20 });

      await payment.update({ amount: 20, externalId: 'foo' });

      await payment.reload();

      expect(payment.modifications[0].current.amount).to.equal(undefined);
    });

    it('includes metadata', async () => {
      const payment = await factory.create('payment', { amount: 20 });

      await payment.update({ amount: 25 }, { metadata: { message: 'Paras 4 eva' } });

      await payment.reload();

      expect(payment.modifications[0].metadata.message).to.equal('Paras 4 eva');
    });

    it('will correctly fix invalid metadata string', async () => {
      const payment = await factory.create('payment', { amount: 20 });

      await sequelize.query(
        `UPDATE payment SET modifications = '"[{}]BACON[OBJECT]"' WHERE id = ?`,
        { replacements: [payment.id] },
      );

      await payment.update({ amount: 25 }, { metadata: { message: 'Paras 4 eva' } });

      await payment.reload();

      expect(payment.modifications[0].metadata.message).to.equal('Paras 4 eva');
    });
  });

  describe('@Scopes', () => {
    context('posted', () => {
      it('does NOT return Canceled payment', async () => {
        const status = ExternalTransactionStatus.Canceled;
        await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments.length).to.be.equal(0);
      });
      it('DOES return Charge Back payment', async () => {
        const status = ExternalTransactionStatus.Chargeback;
        const payment = await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments[0].id).to.be.equal(payment.id);
      });
      it('DOES return Completed payment', async () => {
        const status = ExternalTransactionStatus.Completed;
        const payment = await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments[0].id).to.be.equal(payment.id);
      });
      it('DOES return Pending payment', async () => {
        const status = ExternalTransactionStatus.Pending;
        const payment = await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments[0].id).to.be.equal(payment.id);
      });
      it('does NOT return Returned payment', async () => {
        const status = ExternalTransactionStatus.Returned;
        await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments.length).to.be.equal(0);
      });
      it('DOES return Unknown payment', async () => {
        const status = ExternalTransactionStatus.Unknown;
        const payment = await factory.create('payment', { status });
        const postedPayments = await Payment.scope('posted').findAll();
        expect(postedPayments[0].id).to.be.equal(payment.id);
      });
    });
  });
});
