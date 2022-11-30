import 'mocha';
import {
  AdvanceDelivery,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import { Advance, Payment, PaymentMethod } from '../../../src/models';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import factory from '../../factories';
import { clean, stubLoomisClient } from '../../test-helpers';
import { collectAdvance, createDefaultCharge } from '../../../src/domain/collection';
import * as Jobs from '../../../src/jobs/data';
import * as Tabapay from '../../../src/lib/tabapay';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import { PaymentProcessorError } from '../../../src/lib/error';
import * as ACH from '../../../src/domain/collection/ach';
import { set } from 'lodash';
import BankAccount from '../../../src/models/bank-account';

describe('Collection Domain Outstanding', () => {
  const sandbox = sinon.createSandbox();
  let payment: Payment;

  before(() => clean());

  beforeEach(async () => {
    stubLoomisClient(sandbox);
    payment = await factory.create('payment', { referenceId: 'reference_id' });
    sandbox.stub(Jobs, 'broadcastAdvancePaymentTask');
  });

  afterEach(() => clean(sandbox));

  describe('createDefaultCharge', () => {
    it('attempts the debit card first', async () => {
      const debitCard = await factory.create('payment-method');
      const advance = await factory.create('advance', {
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
      });

      const [charge] = await Promise.all([
        createDefaultCharge(advance),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const cardChargeStub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 'foo',
      });

      const achStub = sandbox
        .stub(SynapsepayNodeLib, 'charge')
        .rejects(new Error('Should not have been called'));
      await charge(20, payment);

      sinon.assert.calledOnce(cardChargeStub);
      sinon.assert.notCalled(achStub);
    });

    it('falls back to ACH the bank account if debit card charge fails', async () => {
      const debitCard: PaymentMethod = await factory.create('payment-method');
      const advance: Advance = await factory.create('advance', {
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
      });

      const [charge] = await Promise.all([
        createDefaultCharge(advance),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const cardChargeStub = sandbox
        .stub(Tabapay, 'retrieve')
        .throws(new PaymentProcessorError('Unspecified error', 'Something'));

      const ach = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
      const achStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: ExternalTransactionStatus.Pending,
        id: 'bar',
      });

      await charge(20, payment);

      sinon.assert.calledWith(ach, sinon.match.instanceOf(moment));
      sinon.assert.calledOnce(cardChargeStub);
      sinon.assert.calledOnce(achStub);
    });

    it('does not attempt ACH if the account has insufficient funds and the card is linked', async () => {
      const debitCard = await factory.create('payment-method', {
        linked: true,
      });
      const transaction = await factory.create('bank-transaction', {
        bankAccountId: debitCard.bankAccountId,
      });

      const advance = await factory.create('advance', {
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
        disbursementBankTransactionId: transaction.id,
        delivery: AdvanceDelivery.Express,
      });

      const [charge] = await Promise.all([
        createDefaultCharge(advance),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const chargeError = new PaymentProcessorError('No funds', '51', {
        data: {},
      });

      const cardChargeStub = sandbox.stub(Tabapay, 'retrieve').rejects(chargeError);

      const achStub = sandbox
        .stub(SynapsepayNodeLib, 'charge')
        .rejects(new Error('Should not have been called'));

      await expect(charge(20, payment)).to.be.rejectedWith('No funds');

      sinon.assert.calledOnce(cardChargeStub);
      sinon.assert.notCalled(achStub);
    });

    it('overrides the insufficient funds error if the card is not linked', async () => {
      const debitCard: PaymentMethod = await factory.create('payment-method', {
        linked: false,
      });

      const advance: Advance = await factory.create('advance', {
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
        disbursementBankTransactionId: null,
        delivery: AdvanceDelivery.Express,
      });

      const [charge] = await Promise.all([
        createDefaultCharge(advance),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const chargeError = new PaymentProcessorError('No funds', '51', {
        data: {},
      });
      set(chargeError, 'data.parsed.ResponseCode', '51');

      const cardChargeStub = sandbox.stub(Tabapay, 'retrieve').rejects(chargeError);

      const ach = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
      const achStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: ExternalTransactionStatus.Pending,
        id: 'bar',
      });

      await charge(20, payment);

      sinon.assert.calledWith(ach, sinon.match.instanceOf(moment));
      sinon.assert.calledOnce(cardChargeStub);
      sinon.assert.calledOnce(achStub);
    });

    it('will not fetch bank account or payment method if attached to the advance', async () => {
      const debitCard: PaymentMethod = await factory.create('payment-method');
      const advance: Advance = await factory.create('advance', {
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
      });
      await factory.create('advance-tip', { advanceId: advance.id });
      advance.paymentMethod = debitCard;
      advance.bankAccount = await BankAccount.findByPk(debitCard.bankAccountId);
      const bankFetchStub = sandbox.stub(BankAccount, 'findOne');
      const paymentMethodFetchStub = sandbox.stub(PaymentMethod, 'findOne');

      expect(bankFetchStub.callCount).to.equal(0);
      expect(paymentMethodFetchStub.callCount).to.equal(0);
    });

    context(
      'when DebitCard throws a PaymentProcessorError and ACH (Synapsepay) throws a random error',
      () => {
        it('(for Tabapay) PaymentProcessorError does not cancel the payment nor sets a deleted timestamp', async () => {
          const debitStub = sandbox
            .stub(Tabapay, 'retrieve')
            .throws(new PaymentProcessorError('Unspecified error', 'Something'));
          const achStub = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
          const synapsepayStub = sandbox.stub(SynapsepayNodeLib, 'charge').throws();
          const paymentMethod = await factory.create('payment-method', {
            tabapayId: 'fakeId',
            risepayId: null,
          });
          const bankAccount = await factory.create('bank-account');
          const advance = await factory.create('advance', {
            bankAccountId: bankAccount.id,
            paymentMethodId: paymentMethod.id,
            amount: 75,
            outstanding: 75,
          });
          const [chargeFn] = await Promise.all([
            createDefaultCharge(advance),
            factory.create('advance-tip', { advanceId: advance.id }),
          ]);
          await collectAdvance(
            advance,
            advance.outstanding,
            chargeFn,
            AdvanceCollectionTrigger.DAILY_CRONJOB,
          );
          const [updatedPayment] = await Payment.findAll({
            where: { advanceId: advance.id },
            paranoid: false,
          });
          expect(debitStub.called).to.eq(true);
          expect(achStub).to.have.been.calledWith(sinon.match.instanceOf(moment));
          expect(synapsepayStub.called).to.eq(true);
          expect(updatedPayment.deleted).to.not.exist;
          expect(updatedPayment.status).to.not.eq(ExternalTransactionStatus.Canceled);
          expect(updatedPayment.externalProcessor).to.eq(ExternalTransactionProcessor.Synapsepay);
        });

        it('(for Tabapay) fallback is attempted', async () => {
          sandbox
            .stub(Tabapay, 'retrieve')
            .throws(new PaymentProcessorError('Unspecified error', 'Something'));
          const achStub = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
          const synapsepayStub = sandbox.stub(SynapsepayNodeLib, 'charge').throws();
          const paymentMethod = await factory.create('payment-method', {
            tabapayId: 'fakeId',
            risepayId: null,
          });
          const bankAccount = await factory.create('bank-account');
          const advance = await factory.create('advance', {
            bankAccountId: bankAccount.id,
            paymentMethodId: paymentMethod.id,
            amount: 75,
            outstanding: 75,
          });

          const [chargeFn] = await Promise.all([
            createDefaultCharge(advance),
            factory.create('advance-tip', { advanceId: advance.id }),
          ]);

          await collectAdvance(
            advance,
            advance.outstanding,
            chargeFn,
            AdvanceCollectionTrigger.DAILY_CRONJOB,
          );
          const [updatedPayment] = await Payment.findAll({
            where: { advanceId: advance.id },
            paranoid: false,
          });
          expect(achStub).to.have.been.calledWith(sinon.match.instanceOf(moment));
          expect(synapsepayStub.called).to.eq(true);
          expect(updatedPayment.externalProcessor).to.eq(ExternalTransactionProcessor.Synapsepay);
        });
      },
    );

    context('when DebitCards throw random non-PaymentProcessorError', () => {
      it('when processing Tabapay does not try fallback charge', async () => {
        sandbox.stub(Tabapay, 'retrieve').throws(new Error('Random error'));
        const achStub = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);
        const synapsepayStub = sandbox.stub(SynapsepayNodeLib, 'charge').throws();
        const paymentMethod = await factory.create('payment-method', {
          tabapayId: 'fakeId',
          risepayId: null,
        });
        const bankAccount = await factory.create('bank-account');
        const advance = await factory.create('advance', {
          bankAccountId: bankAccount.id,
          paymentMethodId: paymentMethod.id,
          amount: 75,
          outstanding: 75,
        });

        const [chargeFn] = await Promise.all([
          createDefaultCharge(advance),
          factory.create('advance-tip', { advanceId: advance.id }),
        ]);
        await collectAdvance(
          advance,
          advance.outstanding,
          chargeFn,
          AdvanceCollectionTrigger.DAILY_CRONJOB,
        );
        const [updatedPayment] = await Payment.findAll({
          where: { advanceId: advance.id },
          paranoid: false,
        });
        expect(achStub.called).to.eq(false);
        expect(synapsepayStub.called).to.eq(false);
        expect(updatedPayment.externalProcessor).to.eq(ExternalTransactionProcessor.Tabapay);
      });
    });
  });
});
