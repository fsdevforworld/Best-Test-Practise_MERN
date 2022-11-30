import 'mocha';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Outstanding from '../../../src/domain/collection/outstanding';
import { getRetrievalAmount } from '../../../src/domain/collection/outstanding';
import { moment } from '@dave-inc/time-lib';
import { Advance, Payment } from '../../../src/models';
import { ReversalStatus } from '../../../src/typings';
import factory from '../../factories';
import {
  advanceFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../../fixtures';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

describe('Collection Domain Outstanding', () => {
  const sandbox = sinon.createSandbox();

  async function createAdvance(fee: number = 5): Promise<Advance> {
    const advance = await Advance.create({
      userId: 3,
      bankAccountId: 2,
      paymentMethodId: 2,
      amount: 75,
      fee,
      paybackDate: moment(),
      delivery: 'express',
      outstanding: 75 + fee,
      disbursementStatus: ExternalTransactionStatus.Completed,
    });
    await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });
    return advance;
  }

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up([
      userFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      paymentMethodFixture,
      advanceFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  describe('.updateOutstanding', () => {
    it('updates the outstanding balance based on payment data', async () => {
      const amount = 20;

      const advance = await Advance.findByPk(14);

      await Payment.create({
        userId: 14,
        advanceId: 14,
        bankAccountId: 14,
        paymentMethodId: 14,
        amount,
        externalId: 'foo-bar',
        status: ExternalTransactionStatus.Completed,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(35);
    });

    it('adds PENDING payments', async () => {
      const amount = 20;

      const advance = await Advance.findByPk(14);

      await Payment.create({
        userId: 14,
        advanceId: 14,
        bankAccountId: 14,
        paymentMethodId: 14,
        amount,
        externalId: 'foo-bar',
        status: ExternalTransactionStatus.Completed,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(35);
    });

    it('adds CHARGEBACK payments', async () => {
      const amount = 20;

      const advance = await Advance.findByPk(14);

      await Payment.create({
        userId: 14,
        advanceId: 14,
        bankAccountId: 14,
        paymentMethodId: 14,
        amount,
        externalId: 'foo-bar',
        status: ExternalTransactionStatus.Chargeback,
      });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(35);
    });

    it('ignores CANCELED payments', async () => {
      const amount = 20;

      const advance = await Advance.findByPk(14);

      await Payment.create({
        userId: 14,
        advanceId: 14,
        bankAccountId: 14,
        paymentMethodId: 14,
        amount,
        externalId: 'foo-bar',
        status: ExternalTransactionStatus.Canceled,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(55);
    });

    it('ignores RETURNED payments', async () => {
      const amount = 20;

      const advance = await Advance.findByPk(14);

      await Payment.create({
        userId: 14,
        advanceId: 14,
        bankAccountId: 14,
        paymentMethodId: 14,
        amount,
        externalId: 'foo-bar',
        status: ExternalTransactionStatus.Returned,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(55);
    });

    it('handles no payments', async () => {
      const advance = await Advance.findByPk(14);

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(55);
    });

    it('sets the receivable amount to 0 for CANCELED disbursements', async () => {
      const advance = await Advance.findByPk(14);
      await advance.update({ disbursementStatus: ExternalTransactionStatus.Canceled });

      await Outstanding.updateOutstanding(advance);

      const updatedAdvance = await Advance.findByPk(14);

      expect(updatedAdvance.outstanding).to.equal(0);
    });

    [
      {
        testName: 'should credit advance outstanding for COMPLETED payment reversals ',
        reversalStatus: ReversalStatus.Completed,
        expectedOutstanding: 49.32,
      },
      {
        testName: 'should credit advance outstanding for PENDING payment reversals',
        reversalStatus: ReversalStatus.Pending,
        expectedOutstanding: 49.32,
      },
      {
        testName: 'should NOT credit advance outstanding for FAILED payment reversals',
        reversalStatus: ReversalStatus.Failed,
        expectedOutstanding: 24.99,
      },
    ].forEach(({ reversalStatus, expectedOutstanding, testName }) => {
      it(testName, async () => {
        const amount = 75;
        const fee = 0;
        const tip = 0;
        const initialOutstanding = 75;
        const disbursementStatus = ExternalTransactionStatus.Completed;
        const paymentAmount = 50.01;
        const reversalAmount = 24.33;

        const advance = await factory.create('advance', {
          amount,
          fee,
          tip,
          disbursementStatus,
          outstanding: initialOutstanding,
        });

        const [payment] = await Promise.all([
          factory.create('payment', {
            advanceId: advance.id,
            status: ExternalTransactionStatus.Completed,
            amount: paymentAmount,
          }),
          factory.create('advance-tip', { advanceId: advance.id, amount: tip }),
        ]);

        await factory.create('payment-reversal', {
          paymentId: payment.id,
          amount: reversalAmount,
          status: reversalStatus,
        });

        await Outstanding.updateOutstanding(advance);

        advance.reload();

        expect(advance.outstanding).to.be.equal(expectedOutstanding);
      });
    });

    context('after a successful refund', () => {
      ['COMPLETED', 'PENDING', 'UNKNOWN'].forEach(reimbursementStatus => {
        it(`includes credits for refund line items that adjust the outstanding, refundStatus: ${reimbursementStatus}`, async () => {
          const [advance, reimbursement] = await Promise.all([
            createAdvance(),
            factory.create('reimbursement', { status: reimbursementStatus }),
          ]);

          expect(advance.outstanding).to.equal(80, 'incorrect inital outstanding balance');

          const advanceRefund = await factory.create('advance-refund', {
            reimbursementId: reimbursement.id,
            advanceId: advance.id,
          });

          await Promise.all([
            factory.create('advance-refund-line-item', {
              advanceRefundId: advanceRefund.id,
              amount: 5,
              adjustOutstanding: true,
            }),
            factory.create('advance-refund-line-item', {
              advanceRefundId: advanceRefund.id,
              amount: 7,
              adjustOutstanding: false,
            }),
          ]);

          await Outstanding.updateOutstanding(advance);

          advance.reload();

          expect(advance.outstanding).to.equal(85);
        });
      });
    });

    context('after an unsuccessful refund', () => {
      ['RETURNED', 'CANCELED', 'FAILED'].forEach(reimbursementStatus => {
        it(`does not includes credits for refund line items, refundStatus: ${reimbursementStatus}`, async () => {
          const [advance, reimbursement] = await Promise.all([
            createAdvance(),
            factory.create('reimbursement', { status: reimbursementStatus }),
          ]);

          expect(advance.outstanding).to.equal(80, 'incorrect inital outstanding balance');

          const advanceRefund = await factory.create('advance-refund', {
            reimbursementId: reimbursement.id,
            advanceId: advance.id,
          });

          await factory.create('advance-refund-line-item', {
            advanceRefundId: advanceRefund.id,
            amount: 5,
            adjustOutstanding: true,
          });

          await Outstanding.updateOutstanding(advance);

          advance.reload();

          expect(advance.outstanding).to.equal(80);
        });
      });
    });
  });

  describe('validatePredictedOutstanding', () => {
    it('handles floating point math', async () => {
      const advance = await createAdvance(4.99);

      await Payment.create({
        advanceId: advance.id,
        userId: advance.userId,
        amount: 60,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Completed,
      });

      await expect(Outstanding.validatePredictedOutstanding(advance, 19.99)).to.be.fulfilled;
    });
  });

  describe('getRetrievalAmount', () => {
    it('is the outstanding amount', async () => {
      const advance = Advance.build({
        outstanding: 80.99,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: 200 });

      expect(retrievalAmount).to.equal(80.99);
    });

    it('leaves the min amount', async () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: 55 }, { minThreshold: 10 });

      expect(retrievalAmount).to.equal(45);
    });

    it('handles no balance', async () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(advance, {
        available: null,
        current: null,
      });

      expect(retrievalAmount).to.equal(null);
    });

    it('handles negative balance', async () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: -100 });

      expect(retrievalAmount).to.equal(null);
    });

    it('rounds partial payments to the nearest $5 increment', async () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: 42 }, { minThreshold: 10 });

      expect(retrievalAmount).to.equal(30);
    });

    it('does not allow partial payments of less than $5', async () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: 12 }, { minThreshold: 10 });

      expect(retrievalAmount).to.equal(0);
    });

    it('allows full payments under $5', async () => {
      const advance = Advance.build({
        outstanding: 2.99,
      });

      const retrievalAmount = getRetrievalAmount(advance, { available: 55 });

      expect(retrievalAmount).to.equal(2.99);
    });

    it('requires a full payment if retrieveFullOutstanding is specified', () => {
      const advance = Advance.build({
        outstanding: 50,
      });

      const retrievalAmount = getRetrievalAmount(
        advance,
        { available: 59 },
        { minThreshold: 10, retrieveFullOutstanding: true },
      );

      expect(retrievalAmount).to.equal(null);
    });
  });
});
