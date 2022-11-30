import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import {
  charge,
  createDebitCardAdvanceCharge,
  PaymentType,
} from '../../../src/domain/collection/charge-debit-card';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { PaymentError } from '../../../src/lib/error';
import * as Tabapay from '../../../src/lib/tabapay';
import { AuditLog, Payment } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('ChargeDebitCard', () => {
  const sandbox = sinon.createSandbox();
  let payment: Payment;

  before(() => clean());

  beforeEach(async () => {
    payment = await factory.create('payment', { referenceId: 'reference_id' });
    sandbox.stub(dogstatsd, 'increment');
  });

  afterEach(() => clean(sandbox));

  describe('createDebitCardAdvanceCharge', () => {
    it('does not pass a correspondingId to the charge method if there is a risepayId on a tabapay payment method', async () => {
      const [card, advance] = await Promise.all([
        factory.create('payment-method', { risepayId: 'blah' }),
        factory.create('advance', {
          disbursementProcessor: 'TABAPAY',
          externalId: 'foo-bar-baz',
        }),
      ]);

      const stub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'sdfljk',
      });

      const debitCharge = createDebitCardAdvanceCharge(card, advance);
      await debitCharge(50, payment);

      sinon.assert.calledWith(stub, sinon.match.string, sinon.match.string, 50, false);
    });

    it('does not pass a correspondingId if the processor is not Tabapay', async () => {
      const [card, advance] = await Promise.all([
        factory.create('payment-method', { risepayId: 'blah' }),
        factory.create('advance', {
          disbursementProcessor: 'BLASTPAY',
          externalId: 'foo-bar-baz',
        }),
      ]);

      const stub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'sdfljk',
      });

      const debitCharge = createDebitCardAdvanceCharge(card, advance);
      await debitCharge(50, payment);

      sinon.assert.calledWith(stub, sinon.match.string, sinon.match.string, 50, false);
    });
  });

  describe('charge', () => {
    it('completes a debit card transaction', async () => {
      const card = await factory.create('payment-method');

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const externalPayment = await charge(card, PaymentType.ADVANCE, 25, payment);

      expect(externalPayment.type).to.equal('debit-card');
      expect(externalPayment.status).to.equal('COMPLETED');
      expect(externalPayment.id).to.equal('foo-bar');
      expect(externalPayment.amount).to.equal(25);
      expect(externalPayment.processor).to.equal('TABAPAY');
    });

    it('logs the external payment', async () => {
      const card = await factory.create('payment-method');

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      const externalPayment = await charge(card, PaymentType.ADVANCE, 25, payment);

      const [log] = await AuditLog.findAll({
        where: {
          userId: card.userId,
          type: 'EXTERNAL_PAYMENT',
        },
      });

      expect(log.successful).to.equal(true);
      expect(log.extra.payment.id).to.equal(externalPayment.id);
      expect(log.extra.payment.type).to.equal('debit-card');
      expect(log.extra.payment.processor).to.equal('TABAPAY');
    });

    it('throws a payment error for debit card is not valid', async () => {
      const paymentMethod = await factory.create('payment-method', {
        invalid: moment().subtract(1, 'day'),
      });

      const advance = await factory.create('advance', {
        amount: 75,
      });

      let exception = null;
      try {
        const chargeFunc = createDebitCardAdvanceCharge(paymentMethod, advance);
        await chargeFunc(75, payment);
      } catch (ex) {
        exception = ex;
      } finally {
        expect(exception).to.be.instanceof(PaymentError);
        await payment.reload();
      }
    });

    it('sets the processor if an error is thrown', async () => {
      const paymentMethod = await factory.create('payment-method');

      sandbox.stub(Tabapay, 'retrieve').rejects(new Error('cheese'));

      const advance = await factory.create('advance', {
        amount: 75,
      });

      await payment.update({ externalProcessor: null });
      let error = null;
      try {
        const chargeFunc = createDebitCardAdvanceCharge(paymentMethod, advance);
        await chargeFunc(75, payment);
      } catch (err) {
        // do nothing
        error = err;
      } finally {
        expect(error).not.to.eq(null);
        await payment.reload();
        expect(payment.externalProcessor).to.eq('TABAPAY');
      }
    });

    it('should throw a PaymentError if the payment method does not have a tabapay id', async () => {
      const card = await factory.create('payment-method-risepay');

      await expect(charge(card, PaymentType.ADVANCE, 25, payment)).to.be.rejectedWith(
        PaymentError,
        'Debit card unsupported',
      );
    });
  });
});
