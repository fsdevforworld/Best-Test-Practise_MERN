import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentProviderTransactionType,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
} from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../test-helpers';
import factory from '../factories';
import { updatePaymentStatus } from '../../src/jobs/handlers/update-payment-status';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Advance, BankAccount, Payment } from '../../src/models';
import * as Jobs from '../../src/jobs/data';
import * as Notification from '../../src/domain/notifications';
import { dogstatsd } from '../../src/lib/datadog-statsd';

describe('job: update-payment-status', () => {
  const userSynapseId = '5d9be7e677ce003fa75f40e7';
  const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
  const userId = 1;

  const sandbox = sinon.createSandbox();

  let bankAccount: BankAccount;
  let advance: Advance;

  before(() => clean());
  beforeEach(async () => {
    const user = await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    bankAccount = await factory.create('checking-account', {
      synapseNodeId,
    });
    bankAccount = await bankAccount.update({ userId: user.id });
    const paymentMethod = await factory.create('payment-method', {
      tabapayId: 'yes-this-is-here',
      risepayId: null,
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    advance = await factory.create('advance', {
      paymentMethodId: paymentMethod.id,
      bankAccountId: bankAccount.id,
      userId: user.id,
    });

    await factory.create('advance-tip', {
      advanceId: advance.id,
    });
  });

  afterEach(() => clean(sandbox));

  it('updates the status of a payment', async () => {
    const payment = await factory.create('payment', {
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
    });

    const tabapayStub = sandbox.stub().resolves({
      type: PaymentProviderTransactionType.AdvancePayment,
      externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
      referenceId: null,
      amount: 0.1,
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      status: PaymentProviderTransactionStatus.Completed,
    });
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Tabapay)
      .returns({ fetchTransaction: tabapayStub });

    await updatePaymentStatus({ paymentId: payment.id });

    await payment.reload();

    expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
    expect(payment.externalId).to.equal('T4ECOVMVCQGO2aV6k6vYGg');
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
  });

  describe('metrics', async () => {
    let dogstatsdStub: sinon.SinonStub;
    beforeEach(() => {
      dogstatsdStub = sandbox.stub(dogstatsd, 'increment');
    });

    it('logs the success', async () => {
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Pending,
        externalId: null,
        referenceId: 'test-ref-4',
        advanceId: advance.id,
        bankAccountId: bankAccount.id,
      });

      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvancePayment,
        externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
        referenceId: null,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      await updatePaymentStatus({ paymentId: payment.id });

      sinon.assert.calledTwice(dogstatsdStub);
      sinon.assert.calledWithExactly(
        dogstatsdStub.firstCall,
        'update_payment_status.job_triggered',
      );
      sinon.assert.calledWithExactly(
        dogstatsdStub.secondCall,
        'update_payment_status.payment_successfully_updated',
        1,
        ['processor:TABAPAY', 'previous_status:PENDING', 'status:COMPLETED'],
      );
    });
  });

  describe('Synapsepay NotFound handling', () => {
    const externalId = 'pelican-xyz';
    const referenceId = 'test-ref-pelican';

    let broadcastPaymentChangedStub: sinon.SinonStub;
    let sendAdvancePaymentFailedStub: sinon.SinonStub;

    beforeEach(() => {
      broadcastPaymentChangedStub = sandbox.stub(Jobs, 'broadcastPaymentChangedTask').resolves();
      sendAdvancePaymentFailedStub = sandbox
        .stub(Notification, 'sendAdvancePaymentFailed')
        .resolves();
    });

    async function runPayment(payment: Payment): Promise<void> {
      const synapseStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvancePayment,
        externalId,
        referenceId,
        amount: 0.1,
        gateway: PaymentGateway.Synapsepay,
        processor: PaymentProcessor.Synapsepay,
        status: PaymentProviderTransactionStatus.NotFound,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub });

      await updatePaymentStatus({ paymentId: payment.id });

      await payment.reload();
    }

    it('Does not cancel a recent Synapse payment if it is not found', async () => {
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Pending,
        externalId,
        referenceId,
        advanceId: advance.id,
        bankAccountId: bankAccount.id,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      await runPayment(payment);

      expect(payment.status).to.equal(ExternalTransactionStatus.Unknown);
      sinon.assert.notCalled(broadcastPaymentChangedStub);
      sinon.assert.notCalled(sendAdvancePaymentFailedStub);
    });

    it('Cancels older Synapse transactions if they are not found', async () => {
      const paleolithicEra = moment().subtract(3, 'days');
      const clock = sandbox.useFakeTimers(paleolithicEra.toDate().getTime());
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Pending,
        externalId,
        referenceId,
        advanceId: advance.id,
        bankAccountId: bankAccount.id,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      clock.restore();
      await runPayment(payment);

      expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
      sinon.assert.calledOnce(broadcastPaymentChangedStub);
      sinon.assert.calledOnce(sendAdvancePaymentFailedStub);
    });

    it('Does not update to UNKNOWN if payment is COMPLETED', async () => {
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Completed,
        externalId,
        referenceId,
        advanceId: advance.id,
        bankAccountId: bankAccount.id,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      await runPayment(payment);

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      sinon.assert.notCalled(broadcastPaymentChangedStub);
      sinon.assert.notCalled(sendAdvancePaymentFailedStub);
    });

    it('Does not update to CANCELED if payment is COMPLETED', async () => {
      const paleolithicEra = moment().subtract(3, 'days');
      const clock = sandbox.useFakeTimers(paleolithicEra.toDate().getTime());
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Completed,
        externalId,
        referenceId,
        advanceId: advance.id,
        bankAccountId: bankAccount.id,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      clock.restore();
      await runPayment(payment);

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      sinon.assert.notCalled(broadcastPaymentChangedStub);
      sinon.assert.notCalled(sendAdvancePaymentFailedStub);
    });
  });

  it('throws "retry" error', async () => {
    const payment = await factory.create('payment', {
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
    });

    const tabapayStub = sandbox.stub().resolves({
      type: PaymentProviderTransactionType.AdvancePayment,
      externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
      referenceId: null,
      amount: 0.1,
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      status: PaymentProviderTransactionStatus.NetworkError,
    });
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Tabapay)
      .returns({ fetchTransaction: tabapayStub });

    await expect(updatePaymentStatus({ paymentId: payment.id })).to.be.rejectedWith(Error);
  });
});
