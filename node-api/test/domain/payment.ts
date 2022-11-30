import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '@dave-inc/loomis-client';
import * as Loomis from '@dave-inc/loomis-client';
import factory from '../factories';
import { expect } from 'chai';
import { clean } from '../test-helpers';
import { refreshPayment, reversePayment } from '../../src/domain/payment';
import * as Notification from '../../src/domain/notifications';
import * as Jobs from '../../src/jobs/data';
import { AuditLog, Payment, PaymentReversal } from '../../src/models';
import * as sinon from 'sinon';
import {
  AdvanceDelivery,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import BankAccount from '../../src/models/bank-account';

describe('PaymentHelper', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let broadcastPaymentChangedStub: sinon.SinonStub;
  let sendAdvancePaymentFailedStub: sinon.SinonStub;

  beforeEach(() => {
    broadcastPaymentChangedStub = sandbox.stub(Jobs, 'broadcastPaymentChangedTask');
    sendAdvancePaymentFailedStub = sandbox.stub(Notification, 'sendAdvancePaymentFailed');
  });

  afterEach(() => clean(sandbox));

  describe('refreshPayment', () => {
    async function createPaymentWithPaymentMethod(paymentFields: any) {
      const bankAccount = await factory.create('checking-account');
      const paymentMethod = await factory.create('payment-method', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        tabapayId: 'yes-hi',
        risepayId: null,
      });

      const advance = await factory.create('advance', {
        amount: 75,
        outstanding: 0,
        fee: 0,
        tip: 0,
        delivery: AdvanceDelivery.Express,
        paymentMethodId: paymentMethod.id,
        bankAccountId: bankAccount.id,
        userId: paymentMethod.userId,
      });

      const [payment] = await Promise.all([
        factory.create('payment', {
          advanceId: advance.id,
          userId: bankAccount.userId,
          paymentMethodId: paymentMethod.id,
          amount: 75,
          status: ExternalTransactionStatus.Pending,
          ...paymentFields,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const user = await bankAccount.getUser();
      await bankAccount.update({ synapseNodeId: '5c37916d51112300617059ee' });
      await user.update({ synapsepayId: '56310bc186c27373fbe8cab7' });

      return payment;
    }

    it('uses the transaction settlement record if available', async () => {
      const externalId = 'external-id-1';
      const externalProcessor = ExternalTransactionProcessor.Tabapay;
      const payment = await createPaymentWithPaymentMethod({ externalId, externalProcessor });

      await factory.create('transaction-settlement', {
        externalId,
        processor: externalProcessor,
        amount: 75,
        status: ExternalTransactionStatus.Canceled,
      });

      await refreshPayment(payment);

      const advance = await payment.getAdvance();

      expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(advance.outstanding).to.equal(75);
      sinon.assert.calledWith(broadcastPaymentChangedStub, {
        paymentId: payment.id,
        time: sinon.match.string,
      });
      sinon.assert.calledWith(sendAdvancePaymentFailedStub, payment);
    });

    it('should not fetch from synapse if provider is tabapay', async () => {
      const externalId = 'external-id-1';
      const externalProcessor = ExternalTransactionProcessor.Tabapay;

      const synapseStub = sandbox.stub();
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId,
        referenceId: null,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub })
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      const payment = await createPaymentWithPaymentMethod({ externalId, externalProcessor });
      await refreshPayment(payment);

      expect(synapseStub.callCount).to.eq(0);
      expect(tabapayStub.callCount).to.eq(1);
    });

    it('saves the updated information fetched from the payment providers', async () => {
      const referenceId = 'test-ref-4';
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
        referenceId,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });
      const payment = await createPaymentWithPaymentMethod({
        status: ExternalTransactionStatus.Pending,
        externalId: null,
        referenceId,
      });

      await refreshPayment(payment);

      expect(payment.externalId).to.equal('T4ECOVMVCQGO2aV6k6vYGg');
      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
      expect(tabapayStub.callCount).to.eq(1);
    });

    it('ignores failed transactions if there is a success', async () => {
      const referenceId = 'test-ref-5';
      const synapseStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: '5c783b57af7f75006647c50c',
        referenceId,
        amount: 0.01,
        gateway: PaymentGateway.Synapsepay,
        processor: PaymentProcessor.Synapsepay,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: 'pelican-1234',
        referenceId,
        amount: 0.01,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Failed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub })
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });
      const payment = await createPaymentWithPaymentMethod({
        status: ExternalTransactionStatus.Pending,
        externalId: null,
        referenceId,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      await refreshPayment(payment);

      expect(payment.externalId).to.equal('5c783b57af7f75006647c50c');
      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);

      expect(synapseStub.callCount).to.equal(1);
      expect(synapseStub).to.have.been.calledWith({
        daveUserId: payment.userId,
        externalId: null,
        ownerId: '56310bc186c27373fbe8cab7',
        processor: ExternalTransactionProcessor.Synapsepay,
        referenceId,
        secret: payment.userId.toString(),
        sourceId: '5c37916d51112300617059ee',
        type: PaymentProviderTransactionType.AdvancePayment,
      });
      expect(tabapayStub.callCount).to.equal(0);
    });

    it('cancels the payment if there are not found external transactions', async () => {
      const referenceId = 'do-not-use';

      const gatewayStub = sandbox.stub(Loomis, 'getPaymentGateway');
      const payment = await createPaymentWithPaymentMethod({
        status: ExternalTransactionStatus.Pending,
        externalId: null,
        referenceId,
      });
      const paymentMethod = await payment.getPaymentMethod();
      await paymentMethod.update({
        risepayId: 'yes-this-is-here',
        tabapayId: null,
      });

      await refreshPayment(payment);

      expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
      sinon.assert.calledWith(broadcastPaymentChangedStub, {
        paymentId: payment.id,
        time: sinon.match.string,
      });
      sinon.assert.calledWith(sendAdvancePaymentFailedStub, payment);
      expect(gatewayStub.callCount).to.equal(0);
    });

    it('fetches pending payments from bank of dave', async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await bankAccount.getUser();
      const bankConnection = await bankAccount.getBankConnection();
      const advance = await factory.create('advance', {
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
        delivery: AdvanceDelivery.Standard,
        externalId: '123123',
        userId: user.id,
      });

      const [payment] = await Promise.all([
        factory.create('payment', {
          status: ExternalTransactionStatus.Pending,
          externalId: 'testing',
          referenceId: 'reference',
          advanceId: advance.id,
          externalProcessor: ExternalTransactionProcessor.BankOfDave,
          bankAccountId: bankAccount.id,
          userId: user.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id, userId: user.id }),
      ]);

      const updatedStatus = PaymentProviderTransactionStatus.Completed;
      const externalId = 'testing';
      const processor = PaymentProcessor.BankOfDave;
      const successfulResponse: PaymentProviderTransaction = {
        status: updatedStatus,
        externalId,
        processor,
        referenceId: '123',
        gateway: PaymentGateway.BankOfDave,
        reversalStatus: null,
      };
      const paymentGatewayStub = sandbox.stub().resolves(successfulResponse);
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.BankOfDave)
        .returns({ fetchTransaction: paymentGatewayStub });

      await refreshPayment(payment);

      expect(payment.status).to.eq(ExternalTransactionStatus.Completed);
      expect(paymentGatewayStub.callCount).to.eq(1);
      expect(paymentGatewayStub.args[0][0]).to.deep.eq({
        externalId: payment.externalId,
        type: PaymentProviderTransactionType.AdvancePayment,
        processor,
        referenceId: payment.referenceId,
        sourceId: bankAccount.externalId,
        ownerId: bankConnection.externalId,
        correspondingId: advance.externalId,
        daveUserId: user.id,
      });
    });

    it('correctly fetches pending payments from synapse', async () => {
      const bankAccount: BankAccount = await factory.create('bank-account');
      const user = await bankAccount.getUser();
      const advance = await factory.create('advance', {
        disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
        delivery: AdvanceDelivery.Standard,
        userId: user.id,
      });

      const [payment] = await Promise.all([
        factory.create('payment', {
          status: ExternalTransactionStatus.Pending,
          externalId: 'testing',
          referenceId: 'reference',
          advanceId: advance.id,
          externalProcessor: ExternalTransactionProcessor.Synapsepay,
          bankAccountId: bankAccount.id,
          userId: user.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id, userId: user.id }),
      ]);

      const updatedStatus = PaymentProviderTransactionStatus.Completed;
      const externalId = 'testing';
      const processor = PaymentProcessor.Synapsepay;
      const successfulResponse: PaymentProviderTransaction = {
        status: updatedStatus,
        externalId,
        processor,
        referenceId: '123',
        gateway: PaymentGateway.Synapsepay,
        reversalStatus: null,
      };
      const paymentGatewayStub = sandbox.stub().resolves(successfulResponse);
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: paymentGatewayStub });

      await refreshPayment(payment);

      expect(payment.status).to.eq(ExternalTransactionStatus.Completed);
      expect(paymentGatewayStub.callCount).to.eq(1);
      expect(paymentGatewayStub.args[0][0]).to.deep.eq({
        externalId: payment.externalId,
        type: PaymentProviderTransactionType.AdvancePayment,
        processor,
        referenceId: payment.referenceId,
        sourceId: bankAccount.synapseNodeId,
        ownerId: user.synapsepayId,
        secret: user.id.toString(),
        daveUserId: user.id,
      });
    });

    it("fetches pending payments from bank of dave even if the payment doesn't reflect it in its external_processor and external id fields", async () => {
      const bankAccount = await factory.create('bank-account');
      const user = await bankAccount.getUser();
      const bankConnection = await bankAccount.getBankConnection();
      const externalId = '1231231';
      const advance = await factory.create('advance', {
        bankAccountId: bankAccount.id,
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
        delivery: AdvanceDelivery.Standard,
        externalId,
        userId: user.id,
      });

      const [payment] = await Promise.all([
        factory.create<Payment>('payment', {
          advanceId: advance.id,
          externalProcessor: null,
          referenceId: 'reference',
          status: ExternalTransactionStatus.Pending,
          userId: user.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id, userId: user.id }),
      ]);

      const updatedStatus = PaymentProviderTransactionStatus.Canceled;
      const processor = PaymentProcessor.BankOfDave;
      const successfulResponse: PaymentProviderTransaction = {
        status: updatedStatus,
        externalId: null,
        processor,
        referenceId: '123',
        gateway: PaymentGateway.BankOfDave,
        reversalStatus: null,
      };

      const synapseErrorResponse: PaymentProviderTransaction = {
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
        processor,
        referenceId: null,
        gateway: PaymentGateway.Synapsepay,
        reversalStatus: null,
      };

      const tabapayErrorResponse: PaymentProviderTransaction = {
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
        processor,
        referenceId: null,
        gateway: PaymentGateway.Tabapay,
        reversalStatus: null,
      };

      const paymentGatewayStub = sandbox.stub().resolves(successfulResponse);
      const synapseGatewayStub = sandbox.stub().resolves(synapseErrorResponse);
      const tabapayGatewayStub = sandbox.stub().resolves(tabapayErrorResponse);
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.BankOfDave)
        .returns({ fetchTransaction: paymentGatewayStub })
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseGatewayStub })
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayGatewayStub });

      await refreshPayment(payment);

      expect(payment.status).to.eq(ExternalTransactionStatus.Canceled);
      expect(paymentGatewayStub.callCount).to.eq(1);
      expect(paymentGatewayStub.args[0][0]).to.deep.eq({
        externalId: payment.externalId,
        type: PaymentProviderTransactionType.AdvancePayment,
        processor,
        referenceId: payment.referenceId,
        sourceId: bankAccount.externalId,
        ownerId: bankConnection.externalId,
        correspondingId: advance.externalId,
        daveUserId: user.id,
      });
      sinon.assert.calledWith(broadcastPaymentChangedStub, {
        paymentId: payment.id,
        time: sinon.match.string,
      });
      sinon.assert.calledWith(sendAdvancePaymentFailedStub, payment);
      expect(synapseGatewayStub.callCount).to.eq(1);
      expect(tabapayGatewayStub.callCount).to.eq(1);
    });

    it('creates an Audit Log entry for why the payment was updated', async () => {
      const referenceId = 'test-ref-4';
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
        referenceId,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });
      const payment = await createPaymentWithPaymentMethod({
        status: ExternalTransactionStatus.Pending,
        externalId: null,
        referenceId: 'test-ref-4',
      });

      await refreshPayment(payment);

      const auditLog = await AuditLog.findOne({
        where: {
          eventUuid: payment.id,
        },
      });

      expect(auditLog.extra.newStatus).to.eq(ExternalTransactionStatus.Completed);
    });
  });

  describe('reversePayment', () => {
    it('successfully reverses a payment completed through Tabapay', async () => {
      const externalId = 'w5EjHdkEiInNHhncKi9WuA';
      const tabapayStub = sandbox.stub().resolves({
        externalId,
        reversalStatus: ReversalStatus.Completed,
        status: PaymentProviderTransactionStatus.Completed,
        processor: PaymentProcessor.Tabapay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ reverseTransaction: tabapayStub });
      const paymentMethod = await factory.create('payment-method', {
        tabapayId: 'my-id-here',
        risepayId: null,
      });

      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Completed,
        externalId,
        paymentMethodId: paymentMethod.id,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });
      await factory.create('advance-tip', { advanceId: payment.advanceId });

      await reversePayment(payment);

      await payment.reload({ include: [PaymentReversal] });

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(payment.reversals[0].status).to.be.equal(ReversalStatus.Completed);

      expect(tabapayStub.callCount).to.equal(1);
      expect(tabapayStub).to.have.been.calledWith({
        daveUserId: payment.userId,
        externalId,
        processor: PaymentProcessor.Tabapay,
        referenceId: null,
        sourceId: 'my-id-here',
        type: PaymentProviderTransactionType.AdvancePayment,
      });
    });

    it('records failed reversals', async () => {
      const externalId = 'j6cAbRQECKUvzugPJSOCyQ';
      const tabapayStub = sandbox.stub().resolves({
        externalId,
        reversalStatus: ReversalStatus.Failed,
        status: PaymentProviderTransactionStatus.Completed,
        processor: PaymentProcessor.Tabapay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ reverseTransaction: tabapayStub });
      const paymentMethod = await factory.create('payment-method', {
        tabapayId: 'my-id-here',
        risepayId: null,
      });

      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Completed,
        externalId,
        paymentMethodId: paymentMethod.id,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      await reversePayment(payment).catch(() => {});
      await payment.reload({ include: [PaymentReversal] });

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(payment.reversals[0].status).to.be.equal(ReversalStatus.Failed);
    });

    it('handles one-time-payments from Tabapay', async () => {
      const externalId = 'w5EjHdkEiInNHhncKi9WuA';
      const tabapayStub = sandbox.stub().resolves({
        externalId,
        reversalStatus: ReversalStatus.Completed,
        status: PaymentProviderTransactionStatus.Completed,
        processor: PaymentProcessor.Tabapay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ reverseTransaction: tabapayStub });
      const payment = await factory.create('payment', {
        status: ExternalTransactionStatus.Completed,
        externalId,
        paymentMethodId: null,
        bankAccountId: null,
      });
      await factory.create('advance-tip', { advanceId: payment.advanceId });

      await reversePayment(payment);

      await payment.reload({ include: [PaymentReversal] });

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(payment.reversals[0].status).to.be.equal(ReversalStatus.Completed);
    });
  });
});
