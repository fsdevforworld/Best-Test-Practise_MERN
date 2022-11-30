// import * as sinon from 'sinon';
import * as Loomis from '@dave-inc/loomis-client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { AuditLog } from '../../src/models';
import factory from '../factories';
import { replayHttp } from '../test-helpers';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { TransactionSettlementSource } from '../../src/typings';
import * as FetchExternalTransaction from '../../src/domain/fetch-external-transaction';
import {
  refreshSubscriptionPayment,
  updatePendingSubscriptionPayment,
} from '../../src/jobs/handlers/update-pending-subscription-payment';
import * as Bluebird from 'bluebird';
import { clean } from '../test-helpers';

describe('job: update-pending-subscription-payment', () => {
  const sandbox = sinon.createSandbox();
  let auditLogCreateSpy: sinon.SinonStub;

  beforeEach(() => {
    auditLogCreateSpy = sandbox.stub(AuditLog, 'create');
  });

  afterEach(() => clean(sandbox));

  xit(
    'It should retreive a PENDING subscription payments by id and run the refresh',
    replayHttp('domain/payment-provider/synapsepay/fetch-with-user.json', async () => {
      const id = 23456;
      const userId = 12345;
      const userSynapseId = '5d9be7e677ce003fa75f40e7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const externalId = '5d9be7ea49c75b1b5662c483';

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const account = await factory.create('checking-account', {
        synapseNodeId,
        userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        id,
        userId,
        bankAccountId: account.id,
        externalId,
        externalProcessor: null,
        status: ExternalTransactionStatus.Pending,
        referenceId: '1234abcd',
      });

      await updatePendingSubscriptionPayment({ subscriptionPaymentId: id });
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Synapsepay);
    }),
  );

  describe('refreshSubscriptionPayment', () => {
    it('uses the transaction settlement record if available', async () => {
      const id = 12345;
      const referenceId = 'reference-id-1';

      const user = await factory.create('user');

      const subscriptionPayment = await factory.create('subscription-payment', {
        id,
        userId: user.id,
        externalId: null,
        externalProcessor: null,
        status: ExternalTransactionStatus.Pending,
        referenceId,
      });

      const externalId = 'external-id-1';
      await Bluebird.delay(1000); // We only want newer records
      await factory.create('transaction-settlement', {
        externalId,
        processor: PaymentProcessor.Tabapay,
        amount: 1,
        status: ExternalTransactionStatus.Completed,
        sourceId: id,
        sourceType: TransactionSettlementSource.SubscriptionPayment,
      });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Tabapay);
    });

    it('saves the updated information fetched from SynapsePay', async () => {
      const id = 23456;
      const userId = 12345;
      const userSynapseId = '5d9be7e677ce003fa75f40e7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const externalId = '5d9be7ea49c75b1b5662c483';

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const account = await factory.create('checking-account', {
        synapseNodeId,
        userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        id,
        userId,
        bankAccountId: account.id,
        externalId,
        externalProcessor: null,
        status: ExternalTransactionStatus.Pending,
        referenceId: '1234abcd',
      });
      const synapseStub = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.Pending,
        externalId,
        processor: PaymentProcessor.Synapsepay,
        referenceId: null,
        gateway: PaymentGateway.Synapsepay,
        reversalStatus: null,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Synapsepay);
    });

    describe('correctly handles and maps specific statuses', async () => {
      async function testRefreshSubscriptionScenario(
        providerStatus: PaymentProviderTransactionStatus,
        expectedStatus: ExternalTransactionStatus,
      ) {
        const id = 23456;
        const userId = 12345;
        const userSynapseId = '5d9be7e677ce003fa75f40e7';
        const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
        const externalId = '5d9be7ea49c75b1b5662c483';

        await factory.create('user', {
          synapsepayId: userSynapseId,
          id: userId,
        });

        const account = await factory.create('checking-account', {
          synapseNodeId,
          userId,
        });

        const subscriptionPayment = await factory.create('subscription-payment', {
          id,
          userId,
          bankAccountId: account.id,
          externalId,
          externalProcessor: null,
          status: ExternalTransactionStatus.Pending,
          referenceId: '1234abcd',
        });

        const fetchTransaction = sandbox.stub().resolves({
          status: providerStatus,
          externalId,
          processor: ExternalTransactionProcessor.Synapsepay,
        });
        sandbox
          .stub(Loomis, 'getPaymentGateway')
          .withArgs(PaymentGateway.Synapsepay)
          .returns({ fetchTransaction });

        await refreshSubscriptionPayment(subscriptionPayment);
        await subscriptionPayment.reload();

        expect(subscriptionPayment.status).to.equal(expectedStatus);
        expect(subscriptionPayment.externalId).to.equal(externalId);
        expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Synapsepay);
      }

      it(`handles ${PaymentProviderTransactionStatus.Returned}`, async () => {
        await testRefreshSubscriptionScenario(
          PaymentProviderTransactionStatus.Returned,
          ExternalTransactionStatus.Returned,
        );
      });

      it(`handles ${PaymentProviderTransactionStatus.Failed}`, async () => {
        await testRefreshSubscriptionScenario(
          PaymentProviderTransactionStatus.Failed,
          ExternalTransactionStatus.Canceled,
        );
      });

      it(`handles ${PaymentProviderTransactionStatus.Completed}`, async () => {
        await testRefreshSubscriptionScenario(
          PaymentProviderTransactionStatus.Completed,
          ExternalTransactionStatus.Completed,
        );
      });

      it(`handles ${PaymentProviderTransactionStatus.Pending}`, async () => {
        await testRefreshSubscriptionScenario(
          PaymentProviderTransactionStatus.Pending,
          ExternalTransactionStatus.Pending,
        );
      });

      it(`handles ${PaymentProviderTransactionStatus.Canceled}`, async () => {
        await testRefreshSubscriptionScenario(
          PaymentProviderTransactionStatus.Canceled,
          ExternalTransactionStatus.Canceled,
        );
      });
    });

    it('saves the updated information fetched from TabaPay', async () => {
      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const userId = 12345;

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        userId,
        bankAccountId: null,
        externalId,
        externalProcessor: PaymentProcessor.Tabapay,
        referenceId,
        status: ExternalTransactionStatus.Pending,
      });
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.SubscriptionPayment,
        externalId,
        referenceId: null,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      const synapseStub = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
        processor: PaymentProcessor.Synapsepay,
        referenceId: null,
        gateway: PaymentGateway.Synapsepay,
        reversalStatus: null,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub })
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Tabapay);
    });

    it('does not cancel a payment as long as one of the gateways succeeds', async () => {
      /**
       * simulate a failing gateway call early in the flow to
       * verify that it won't short-circuit the whole process
       * */
      sandbox
        .stub(FetchExternalTransaction, 'determinePaymentGatewaysToCheck')
        .resolves([PaymentGateway.Synapsepay, PaymentGateway.BankOfDave, PaymentGateway.Tabapay]);

      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const userId = 12345;

      /**
       * Return a NotFound Response, which under the old behavior would cause
       * the transaction to be canceled, but under the new RefreshExternalTransaction
       * behavior should still allow other Payment Providers to give a response
       */
      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.SubscriptionPayment,
        externalId,
        referenceId: null,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });
      const notFoundStub = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
        processor: PaymentProcessor.Synapsepay,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .returns({ fetchTransaction: notFoundStub })
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        userId,
        bankAccountId: null,
        externalId,
        externalProcessor: PaymentProcessor.Tabapay,
        referenceId,
        status: ExternalTransactionStatus.Pending,
      });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Tabapay);
    });

    it('does not keep a payment stuck in pending if one gateway gives an error response, as long as any of the gateways succeeds', async () => {
      /**
       * simulate a failing gateway call early in the flow to
       * verify that it won't short-circuit the whole process
       * */
      sandbox
        .stub(FetchExternalTransaction, 'determinePaymentGatewaysToCheck')
        .resolves([PaymentGateway.BankOfDave, PaymentGateway.Synapsepay, PaymentGateway.Tabapay]);

      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const userId = 12345;

      /**
       * Return an InvalidRequest Response, which under the old behavior would cause us to
       * stop checking each gateway for a new status, and leave the transaction stuck in
       * pending. Now, this response should still allow a status update, as long as one
       * gateway provides a meaningful response
       */
      const bankOfDaveStub = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.InvalidRequest,
        externalId,
        processor: PaymentProcessor.BankOfDave,
      });

      const synapseStub = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
        processor: PaymentProcessor.Synapsepay,
      });

      const tabapayStub = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.SubscriptionPayment,
        externalId,
        referenceId: null,
        amount: 0.1,
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
      });

      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.BankOfDave)
        .returns({ fetchTransaction: bankOfDaveStub })
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub })
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        userId,
        bankAccountId: null,
        externalId,
        externalProcessor: PaymentProcessor.Tabapay,
        referenceId,
        status: ExternalTransactionStatus.Pending,
      });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Completed);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(PaymentProcessor.Tabapay);
    });

    it('cancels the payment if there are no found external transactions and the payment has an associated bankAccount or paymentMethod', async () => {
      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const id = 23456;
      const userId = 12345;

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      const account = await factory.create('checking-account', {
        synapseNodeId,
        userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        id,
        userId,
        bankAccountId: account.id,
        externalId,
        externalProcessor: null,
        status: ExternalTransactionStatus.Pending,
        referenceId,
      });
      const fetchTransaction = sandbox.stub().resolves({
        status: PaymentProviderTransactionStatus.NotFound,
        externalId,
      });
      sandbox.stub(Loomis, 'getPaymentGateway').returns({ fetchTransaction });

      await refreshSubscriptionPayment(subscriptionPayment);
      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(null);

      // No audit logs since not found is expected
      expect(auditLogCreateSpy.callCount).to.eq(0);
    });
  });

  // Temporarily disable this until we verify that Risepay and Bank of Dave still work
  xit(
    'keeps pending if synapse succeeds but tabapay fails',
    replayHttp('domain/fetch-external-transaction/fetch-subscription-failure.json', async () => {
      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const id = 23456;
      const userId = 12345;

      await factory.create('user', {
        synapsepayId: userSynapseId,
        id: userId,
      });

      await factory.create('checking-account', {
        synapseNodeId,
        userId,
      });

      const subscriptionPayment = await factory.create('subscription-payment', {
        id,
        userId,
        paymentMethodId: null,
        bankAccountId: null,
        externalId,
        externalProcessor: null,
        status: ExternalTransactionStatus.Pending,
        referenceId,
      });

      const auditLog = {
        userId,
        type: 'UPDATE_SUBSCRIPTION_PAYMENT_STATUS',
        message: 'Error fetching subscription payment status',
        successful: false,
        extra: {
          failedTransactions: [
            {
              amount: null as any,
              externalId: 'my-test-external-4',
              gateway: 'TABAPAY',
              outcome: null as any,
              processor: 'TABAPAY',
              referenceId: 'my-test-ref-4',
              reversalStatus: null as any,
              status: 'NETWORK_ERROR',
              type: 'subscription-payment',
            },
            {
              amount: null as any,
              externalId: 'my-test-external-4',
              gateway: 'SYNAPSEPAY',
              outcome: null as any,
              processor: 'SYNAPSEPAY',
              referenceId: 'my-test-ref-4',
              reversalStatus: null as any,
              status: 'NETWORK_ERROR',
              type: 'subscription-payment',
            },
          ],
          subscriptionPaymentId: subscriptionPayment.id,
        },
      };

      await refreshSubscriptionPayment(subscriptionPayment);

      await subscriptionPayment.reload();

      expect(subscriptionPayment.status).to.equal(ExternalTransactionStatus.Pending);
      expect(subscriptionPayment.externalId).to.equal(externalId);
      expect(subscriptionPayment.externalProcessor).to.equal(null);

      // Delete the raw field since it contains a stack trace that could change
      delete auditLogCreateSpy.args[0][0].extra.failedTransactions[0].raw;
      delete auditLogCreateSpy.args[0][0].extra.failedTransactions[1].raw;
      expect(auditLogCreateSpy.args[0][0]).to.deep.equal(auditLog);
    }),
  );
});
