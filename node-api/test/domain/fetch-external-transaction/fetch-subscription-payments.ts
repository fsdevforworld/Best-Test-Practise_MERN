import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentProviderTransactionType,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
} from '@dave-inc/loomis-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import Sinon, * as sinon from 'sinon';
import { fetchSubscriptionPayment } from '../../../src/domain/fetch-external-transaction';
import { determinePaymentGatewaysToCheck } from '../../../src/domain/fetch-external-transaction/fetch-subscription-payment';
import { BankAccount, PaymentMethod, SubscriptionPayment } from '../../../src/models';
import factory from '../../factories';
import { clean, stubLoomisClient } from '../../test-helpers';

describe('FetchSubscriptionPayment', () => {
  let sandbox: Sinon.SinonSandbox;
  before(async () => {
    await clean();
    sandbox = sinon.createSandbox();
    stubLoomisClient(sandbox);
  });

  afterEach(async () => {
    await clean(sandbox);
    stubLoomisClient(sandbox);
  });

  after(() => clean(sandbox));

  it('sucessfully fetches a transaction from SynapsePay', async () => {
    const userSynapseId = '5d9be7e677ce003fa75f40e7';
    const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
    const externalId = '5d9be7ea49c75b1b5662c483';
    const userId = 12345;

    await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    const account: BankAccount = await factory.create('checking-account', {
      synapseNodeId,
      userId,
    });

    const payment: SubscriptionPayment = await factory.create('subscription-payment', {
      userId,
      bankAccountId: account.id,
      externalId,
      externalProcessor: PaymentProcessor.Tabapay,
    });

    const fetchTransaction = sandbox.stub().resolves({
      externalId,
      referenceId: null,
      amount: payment.amount,
      gateway: PaymentGateway.Synapsepay,
      status: PaymentProviderTransactionStatus.Pending,
      processor: PaymentProcessor.Synapsepay,
      reversalStatus: null,
      outcome: { code: 'pelican', message: 'pelican pelican' },
    });
    sandbox.stub(Loomis, 'getPaymentGateway').returns({ fetchTransaction });

    const externalTransaction = await fetchSubscriptionPayment(payment);

    expect(externalTransaction.externalId).to.equal(externalId);
    expect(externalTransaction.processor).to.equal(PaymentProcessor.Synapsepay);
    expect(externalTransaction.gateway).to.equal(PaymentGateway.Synapsepay);
    expect(externalTransaction.status).to.equal(PaymentProviderTransactionStatus.Pending);

    expect(fetchTransaction.callCount).to.equal(1);
    expect(fetchTransaction).to.have.been.calledWith({
      daveUserId: userId,
      externalId,
      ownerId: userSynapseId,
      processor: PaymentProcessor.Synapsepay,
      referenceId: undefined,
      secret: userId.toString(),
      sourceId: synapseNodeId,
      type: PaymentProviderTransactionType.SubscriptionPayment,
    });
  });

  it('successfully fetches a transaction from TabaPay when SynapsePay fails', async () => {
    const referenceId = 'my-test-ref-4';
    const externalId = 'my-test-external-4';
    const userSynapseId = '56310bc186c27373fbe8cab7';
    const userId = 12345;

    await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    const paymentMethod: PaymentMethod = await factory.create('payment-method', {
      userId,
    });

    const payment: SubscriptionPayment = await factory.create('subscription-payment', {
      userId,
      bankAccountId: null,
      paymentMethodId: paymentMethod.id,
      externalId,
      externalProcessor: PaymentProcessor.Tabapay,
      referenceId,
    });

    const fetchTransaction = sandbox.stub().resolves({
      externalId,
      referenceId,
      amount: payment.amount,
      gateway: PaymentGateway.Tabapay,
      status: PaymentProviderTransactionStatus.Completed,
      processor: PaymentProcessor.Tabapay,
      reversalStatus: null,
      outcome: { code: 'pelican' },
    });
    sandbox.stub(Loomis, 'getPaymentGateway').returns({ fetchTransaction });

    const externalTransaction = await fetchSubscriptionPayment(payment);

    expect(externalTransaction.referenceId).to.equal(referenceId);
    expect(externalTransaction.amount).to.equal(1);
    expect(externalTransaction.processor).to.equal(PaymentProcessor.Tabapay);
    expect(externalTransaction.gateway).to.equal(PaymentGateway.Tabapay);
    expect(externalTransaction.status).to.equal(PaymentProviderTransactionStatus.Completed);

    expect(fetchTransaction.callCount).to.equal(1);
    expect(fetchTransaction).to.have.been.calledWith({
      daveUserId: userId,
      externalId,
      referenceId,
      processor: PaymentProcessor.Tabapay,
      sourceId: undefined,
      type: PaymentProviderTransactionType.SubscriptionPayment,
    });
  });

  describe('excludes risepay', () => {
    it('does not process Risepay', async () => {
      const paymentMethod = await factory.create('payment-method', {
        risepayId: 1,
        tabapayId: null,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        bankAccountId: null,
        paymentMethodId: paymentMethod.id,
        userId: paymentMethod.userId,
      });

      const externalPayment = await fetchSubscriptionPayment(subscriptionPayment);

      expect(externalPayment).to.eq(undefined);
    });
  });

  it('successfully Tabapay and then Synapsepay when no payment method is present', async () => {
    const tabapayStub = sandbox.stub().resolves(null);
    const synapseStub = sandbox.stub().resolves(null);
    const bankOfDaveStub = sandbox.stub().resolves(null);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Tabapay)
      .returns({ fetchTransaction: tabapayStub })
      .withArgs(PaymentGateway.Synapsepay)
      .returns({ fetchTransaction: synapseStub })
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ fetchTransaction: bankOfDaveStub });

    const referenceId = 'my-test-ref-4';
    const externalId = 'my-test-external-4';
    const userSynapseId = '56310bc186c27373fbe8cab7';

    const userId = 12345;

    await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    const payment: SubscriptionPayment = await factory.create('subscription-payment', {
      userId,
      bankAccountId: null,
      paymentMethodId: null,
      externalId,
      externalProcessor: PaymentProcessor.Tabapay,
      referenceId,
    });
    await fetchSubscriptionPayment(payment);

    expect(tabapayStub).to.have.callCount(1);
    expect(synapseStub).to.have.callCount(1);
    expect(bankOfDaveStub).to.have.callCount(1);
  });

  it('handles not found from all services', async () => {
    const referenceId = 'my-test-ref-4';
    const externalId = 'my-test-external-4';
    const userSynapseId = '56310bc186c27373fbe8cab7';
    const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
    const userId = 12345;

    await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    const account: BankAccount = await factory.create('checking-account', {
      synapseNodeId,
      userId,
    });

    const payment: SubscriptionPayment = await factory.create('subscription-payment', {
      userId,
      bankAccountId: account.id,
      externalId,
      externalProcessor: PaymentProcessor.Tabapay,
      referenceId,
    });

    const fetchTransaction = sandbox.stub().resolves({
      externalId,
      referenceId,
      amount: null,
      gateway: PaymentGateway.Synapsepay,
      status: PaymentProviderTransactionStatus.NotFound,
      processor: PaymentProcessor.Synapsepay,
      type: PaymentProviderTransactionType.SubscriptionPayment,
      reversalStatus: null,
      outcome: null,
    });
    sandbox.stub(Loomis, 'getPaymentGateway').returns({ fetchTransaction });

    const externalTransaction = await fetchSubscriptionPayment(payment);

    expect(externalTransaction.status).to.equal(PaymentProviderTransactionStatus.NotFound);
    expect(fetchTransaction.callCount).to.equal(1);
    expect(fetchTransaction).to.have.been.calledWith({
      daveUserId: userId,
      externalId,
      ownerId: userSynapseId,
      processor: PaymentProcessor.Synapsepay,
      referenceId,
      secret: userId.toString(),
      sourceId: synapseNodeId,
      type: PaymentProviderTransactionType.SubscriptionPayment,
    });
  });

  describe('determinePaymentGatewaysToCheck', async () => {
    it('correctly identifies Bank of Dave', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        bankAccountId: bankAccount.id,
        paymentMethodId: null,
        userId: bankAccount.userId,
      });

      const paymentGateways = await determinePaymentGatewaysToCheck(subscriptionPayment);
      expect(paymentGateways).to.deep.eq([PaymentGateway.BankOfDave]);
    });

    it('correctly identifies Synapsepay from Plaid', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        paymentMethodId: null,
        userId: bankConnection.userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
      });

      const paymentGateways = await determinePaymentGatewaysToCheck(subscriptionPayment);
      expect(paymentGateways).to.deep.eq([PaymentGateway.Synapsepay]);
    });

    it('correctly identifies Synapsepay from MX', async () => {
      const bankConnection = await factory.create('bank-connection', {
        bankingDataSource: BankingDataSource.Mx,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        bankAccountId: bankAccount.id,
        paymentMethodId: null,
        userId: bankAccount.userId,
      });

      const paymentGateways = await determinePaymentGatewaysToCheck(subscriptionPayment);
      expect(paymentGateways).to.deep.eq([PaymentGateway.Synapsepay]);
    });

    it('correctly identifies Tabapay', async () => {
      const { id: paymentMethodId, userId } = await factory.create('payment-method', {
        risepayId: null,
        tabapayId: 1,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        paymentMethodId,
        bankAccountId: null,
        userId,
      });

      const paymentGateways = await determinePaymentGatewaysToCheck(subscriptionPayment);
      expect(paymentGateways).to.deep.eq([PaymentGateway.Tabapay]);
    });

    it('correctly handled unknown bank account and payment method', async () => {
      const { id: userId } = await factory.create('user');
      const subscriptionPayment = await factory.create('subscription-payment', {
        userId,
        bankAccountId: null,
        paymentMethodId: null,
      });
      const paymentGateways = await determinePaymentGatewaysToCheck(subscriptionPayment);
      expect(paymentGateways).to.deep.eq([
        PaymentGateway.Synapsepay,
        PaymentGateway.Tabapay,
        PaymentGateway.BankOfDave,
      ]);
    });
  });
});
