import 'mocha';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { AdvanceCollectionAttempt, Payment } from '../../../src/models';
import { AdvanceCollectionTrigger, ChargeableMethod } from '../../../src/typings';
import factory from '../../factories';
import {
  advanceFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../../fixtures';
import { clean, stubBankTransactionClient, stubLoomisClient, up } from '../../test-helpers';
import { collectAdvance, createDefaultCharge } from '../../../src/domain/collection';
import * as ActiveCollection from '../../../src/domain/active-collection';
import { moment } from '@dave-inc/time-lib';
import * as Tabapay from '../../../src/lib/tabapay';
import * as Jobs from '../../../src/jobs/data';
import braze from '../../../src/lib/braze';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

describe('Collection Domain Collect Advance', () => {
  const sandbox = sinon.createSandbox();
  let broadcastAdvancePaymentJobsStub: sinon.SinonStub;
  let isActiveCollectionStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    stubLoomisClient(sandbox);
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    broadcastAdvancePaymentJobsStub = sandbox.stub(Jobs, 'broadcastAdvancePaymentTask');
    isActiveCollectionStub = sandbox.stub(ActiveCollection, 'isActiveCollection').resolves(true);
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

  describe('collect', () => {
    it('does not allow two collection attempts concurrently', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      await Promise.all([
        factory.create('advance-collection-attempt', {
          processing: true,
          advanceId: advance.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: any) => {
        throw new Error('createExternalPayment should not have been called');
      };

      await expect(
        collectAdvance(advance, 50, createExternalPayment, AdvanceCollectionTrigger.DAILY_CRONJOB),
      ).to.be.rejectedWith('Collection already in progress');
    });

    it('sets old existing collection attempts to not-processing', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      const [staleCollectionAttempt] = await Promise.all([
        factory.create('advance-collection-attempt', {
          processing: true,
          advanceId: advance.id,
          created: moment().subtract(30, 'minutes'),
        }),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: any) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: 75,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      await expect(
        collectAdvance(advance, 50, createExternalPayment, AdvanceCollectionTrigger.DAILY_CRONJOB),
      ).to.not.be.rejectedWith('Collection already in progress');
      await staleCollectionAttempt.reload();
      expect(staleCollectionAttempt.processing).to.not.equal(true);
    });

    it('waits thirty minutes before clearing an old collection attempt', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      const THIRTY_MINUTES_IN_SECONDS = 30 * 60;

      const [oldCollectionAttempt] = await Promise.all([
        factory.create('advance-collection-attempt', {
          processing: true,
          advanceId: advance.id,
          created: moment().subtract(THIRTY_MINUTES_IN_SECONDS - 2, 'seconds'),
        }),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: any) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: 75,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      await expect(
        collectAdvance(advance, 50, createExternalPayment, AdvanceCollectionTrigger.DAILY_CRONJOB),
      ).to.be.rejectedWith('Collection already in progress');
      await oldCollectionAttempt.reload();
      expect(oldCollectionAttempt.processing).to.equal(true);
    });

    it('creates a payment', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: 75,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      const collectionAttempt = await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(true);

      const payment = await Payment.findByPk(collectionAttempt.paymentId);

      expect(payment.amount).to.equal(75);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
      expect(payment.externalId).to.equal('test-external-id');
    });

    it('does not attempt collection if the amount is zero', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 0,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = sandbox.spy();

      const collectionAttempt = await collectAdvance(
        advance,
        0,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal('Failed collection validations');
      expect(createExternalPayment.callCount).to.equal(0);
    });

    it('does not attempt collection if the amount is less than zero', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 0,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = sandbox.spy();

      const collectionAttempt = await collectAdvance(
        advance,
        -1,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal('Failed collection validations');
      expect(createExternalPayment.callCount).to.equal(0);
    });

    it('updates the outstanding balance', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        fee: 0,
        outstanding: 75.5,
      });

      await factory.create('advance-tip', { advanceId: advance.id, amount: 0.5 });

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      await collectAdvance(
        advance,
        50.5,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      await advance.reload();

      expect(advance.outstanding).to.equal(25);
    });

    it('marks the collection attempt as no longer processing', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: 75,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      const collectionAttempt = await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      await collectionAttempt.reload();

      expect(collectionAttempt.processing).to.equal(false);
    });

    it('does not attempt collection if the predicted outstanding is less than zero', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      await Promise.all([
        Payment.create({
          advanceId: advance.id,
          userId: advance.userId,
          amount: 50,
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const createExternalPayment = (amount: number) => {
        throw new Error('createExternalPayment should not have been called');
      };

      const brazeSpy = sandbox.spy(braze, 'track');
      const collectionAttempt = await collectAdvance(
        advance,
        50,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal(
        'Payment amount larger than outstanding balance',
      );
      expect(brazeSpy.callCount).to.equal(0);
    });

    it('does not fire missed payback event if paybackDate has not passed', async () => {
      const paybackDate = moment().add(1, 'day');
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
        paybackDate,
      });

      await Promise.all([
        Payment.create({
          advanceId: advance.id,
          userId: advance.userId,
          amount: 50,
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const createExternalPayment = () => {
        throw new Error('createExternalPayment should not have been called');
      };

      const brazeSpy = sandbox.spy(braze, 'track');
      const collectionAttempt = await collectAdvance(
        advance,
        50,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal(
        'Payment amount larger than outstanding balance',
      );
      expect(brazeSpy.callCount).to.equal(0);
    });

    it('fires missed payback event if paybackDate has passed', async () => {
      const paybackDate = moment().subtract(1, 'day');
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
        paybackDate,
      });

      await Promise.all([
        Payment.create({
          advanceId: advance.id,
          userId: advance.userId,
          amount: 50,
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const createExternalPayment = () => {
        throw new Error('createExternalPayment should not have been called');
      };

      const brazeSpy = sandbox.spy(braze, 'track');
      const collectionAttempt = await collectAdvance(
        advance,
        50,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal(
        'Payment amount larger than outstanding balance',
      );
      expect(brazeSpy.callCount).to.equal(1);
    });

    it('fires missed payback event if paybackDate is today', async () => {
      const paybackDate = moment();
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
        paybackDate,
      });

      await Promise.all([
        Payment.create({
          advanceId: advance.id,
          userId: advance.userId,
          amount: 50,
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const createExternalPayment = () => {
        throw new Error('createExternalPayment should not have been called');
      };

      const brazeSpy = sandbox.spy(braze, 'track');
      const collectionAttempt = await collectAdvance(
        advance,
        50,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(collectionAttempt.extra.err.message).to.equal(
        'Payment amount larger than outstanding balance',
      );
      expect(brazeSpy.callCount).to.equal(1);
    });

    it('associates the payment with the correct bank account', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      const [bankAccount] = await Promise.all([
        factory.create('bank-account'),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: 75,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
          chargeable: bankAccount,
        });

      const collectionAttempt = await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      const payment = await collectionAttempt.getPayment();

      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.paymentMethodId).to.equal(null);
    });

    it('calls tabapay retrieve with isSubscription = false', async () => {
      const debitChargeSpy = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 'foo',
      });

      const expectedAmount = 75;

      const debitCard = await factory.create('payment-method');
      const advance = await factory.create('advance', {
        amount: expectedAmount,
        outstanding: 75,
        bankAccountId: debitCard.bankAccountId,
        paymentMethodId: debitCard.id,
      });

      const [charge] = await Promise.all([
        createDefaultCharge(advance),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      await collectAdvance(advance, expectedAmount, charge, AdvanceCollectionTrigger.DAILY_CRONJOB);

      const isSubscriptionCharge = false;
      sinon.assert.calledWith(
        debitChargeSpy,
        sinon.match.string,
        sinon.match.string,
        expectedAmount,
        isSubscriptionCharge,
      );
    });

    it('associates the payment with the correct payment method', async () => {
      const expectedAmount = 75;

      const advance = await factory.create('advance', {
        amount: expectedAmount,
        outstanding: 75,
      });

      const [paymentMethod] = await Promise.all([
        factory.create('payment-method'),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: expectedAmount,
          processor: ExternalTransactionProcessor.Tabapay,
          type: ChargeableMethod.DebitCard,
          chargeable: paymentMethod,
        });

      const collectionAttempt = await collectAdvance(
        advance,
        expectedAmount,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      const payment = await collectionAttempt.getPayment();

      expect(payment.bankAccountId).to.equal(null);
      expect(payment.paymentMethodId).to.equal(paymentMethod.id);
    });

    it('handles a payment without a bank account or payment method', async () => {
      const expectedAmount = 75;

      const advance = await factory.create('advance', {
        amount: expectedAmount,
        outstanding: 75,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: expectedAmount,
          processor: ExternalTransactionProcessor.Tabapay,
          type: ChargeableMethod.DebitCard,
          chargeable: null,
        });

      const collectionAttempt = await collectAdvance(
        advance,
        expectedAmount,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(true, 'Collection attempt failed');

      const payment = await collectionAttempt.getPayment();

      expect(payment.bankAccountId).to.equal(null);
      expect(payment.paymentMethodId).to.equal(null);
      expect(payment.advanceId).to.equal(advance.id);
      expect(payment.userId).to.equal(advance.userId);
    });

    it('queues a background job to broadcast the payment to analytics', async () => {
      const expectedAmount = 75;

      const advance = await factory.create('advance', {
        amount: expectedAmount,
        outstanding: 75,
      });

      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: 'test-external-id',
          amount: expectedAmount,
          processor: ExternalTransactionProcessor.Synapsepay,
          type: ChargeableMethod.Ach,
        });

      const { paymentId } = await collectAdvance(
        advance,
        expectedAmount,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(broadcastAdvancePaymentJobsStub).to.be.calledWithExactly({ paymentId });
    });

    it('does not delete the payment on an unexpected error', async () => {
      const paymentExternalId = 'test-external-id';

      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      const paymentMethod = await Promise.all([
        factory.create('payment-method'),
        factory.create('advance-tip', { advanceId: advance.id }),
      ]);

      const createExternalPayment = (amount: number) =>
        factory.build('external-payment', {
          id: paymentExternalId,
          amount: 75,
          processor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
          type: ChargeableMethod.DebitCard,
          chargeable: paymentMethod,
        });

      sandbox.stub(AdvanceCollectionAttempt.prototype, 'setPayment').rejects();

      await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      const payment = await Payment.findOne({
        where: { externalId: paymentExternalId },
        paranoid: false,
      });

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(payment.deleted).to.equal(null);
    });

    it('keeps payment in PENDING status when unknown error occurs and updates outstanding balance', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });

      await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });

      const createExternalPayment = (amount: number) => {
        throw new Error('random error');
      };

      await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      const payment = await Payment.findOne({
        where: { advanceId: advance.id },
        paranoid: false,
      });

      await advance.reload();

      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.deleted).to.equal(null);
      expect(advance.outstanding).to.equal(0);
    });

    it('keeps payment in PENDING status when unknown Tabapay error occurs and updates outstanding balance', async () => {
      const user = await factory.create('user');

      const paymentMethod = await factory.create('payment-method', {
        risepayId: null,
        tabapayId: 'fake-tabapay-id',
        userId: user.id,
      });

      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
        userId: user.id,
        paymentMethodId: paymentMethod.id,
      });

      await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });

      sandbox.stub(Tabapay, 'retrieve').rejects();

      const chargeFn = await createDefaultCharge(advance);

      await collectAdvance(advance, 75, chargeFn, AdvanceCollectionTrigger.DAILY_CRONJOB);

      const payment = await Payment.findOne({
        where: { advanceId: advance.id },
        paranoid: false,
      });

      await advance.reload();

      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.deleted).to.equal(null);
      expect(advance.outstanding).to.equal(0);
    });

    it('does not collect when another advance is active', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });
      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = sandbox.spy();
      isActiveCollectionStub.resolves(false);

      const collectionAttempt = await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.DAILY_CRONJOB,
      );

      expect(collectionAttempt.successful()).to.equal(false);
      expect(createExternalPayment.callCount).to.equal(0);
      expect(collectionAttempt.extra?.err?.data[0].type).to.equal('collecting-another-advance');
    });

    it('does collect for manual triggers even if current advance is active', async () => {
      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 75,
      });
      await factory.create('advance-tip', { advanceId: advance.id });

      const createExternalPayment = sandbox.spy();
      isActiveCollectionStub.resolves(false);

      const collectionAttempt = await collectAdvance(
        advance,
        75,
        createExternalPayment,
        AdvanceCollectionTrigger.ADMIN,
      );

      expect(collectionAttempt.successful()).to.equal(true);
      expect(createExternalPayment.callCount).to.equal(1);
    });
  });
});
