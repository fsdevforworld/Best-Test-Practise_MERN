import * as request from 'supertest';
import * as Loomis from '@dave-inc/loomis-client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import app from '../../../../src/services/internal-dashboard-api';
import { TransactionSettlementStatus } from '@dave-inc/wire-typings';

describe('/dashboard/external_transaction', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('GET /dashboard/external_transaction/search', () => {
    context('when invalid parameters are sent', () => {
      it('should fail if neither externalId nor referenceId are present', async () => {
        const req = request(app)
          .get('/dashboard/external_transaction/search')
          .query({ transactionType: 'test' });
        const result = await withInternalUser(req);

        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(/Must provide either an externalId or a referenceId/);
      });
    });

    context('when valid parameters are present', () => {
      context('search by External ID', () => {
        it('should search in settlement record first and return if found', async () => {
          const externalId = 'T4ECOVMVCQGO2aV6k6vYGg';
          const settlementAmount = 5;
          const settlementStatus = TransactionSettlementStatus.Canceled;

          await factory.create('transaction-settlement', {
            externalId,
            processor: PaymentProcessor.Tabapay,
            amount: settlementAmount,
            status: settlementStatus,
          });

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              externalId,
              transactionType: PaymentProviderTransactionType.AdvancePayment,
            });
          const res1 = await withInternalUser(req);

          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.externalId).to.equal(externalId);
          expect(transaction.amount).to.equal(settlementAmount);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.status).to.equal(settlementStatus);
          expect(transaction.isSettlement).to.equal(true);
        });

        it('should search in gateway API if settlement record not found', async () => {
          const externalId = 'T4ECOVMVCQGO2aV6k6vYGg';
          const tabapayStub = sandbox.stub().resolves({
            type: PaymentProviderTransactionType.AdvanceDisbursement,
            externalId,
            referenceId: 'test-ref-4',
            amount: 0.1,
            gateway: PaymentGateway.Tabapay,
            processor: PaymentProcessor.Tabapay,
            status: PaymentProviderTransactionStatus.Completed,
          });
          const notFoundStub = sandbox.stub().resolves({
            status: PaymentProviderTransactionStatus.NotFound,
            externalId,
            referenceId: null,
            reversalStatus: null,
          });
          sandbox
            .stub(Loomis, 'getPaymentGateway')
            .returns({ fetchTransaction: notFoundStub })
            .withArgs(PaymentGateway.Tabapay)
            .returns({ fetchTransaction: tabapayStub })
            .withArgs(PaymentGateway.Synapsepay);

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              externalId,
              transactionType: PaymentProviderTransactionType.AdvancePayment,
            });
          const res1 = await withInternalUser(req);

          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.externalId).to.equal(externalId);
          expect(transaction.referenceId).to.equal('test-ref-4');
          expect(transaction.amount).to.equal(0.1);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.gateway).to.equal(PaymentGateway.Tabapay);
          expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
          expect(transaction.isSettlement).to.equal(false);
          expect(tabapayStub.callCount).to.equal(1);
          expect(tabapayStub).to.have.been.calledWith({
            externalId,
            referenceId: undefined,
            type: PaymentProviderTransactionType.AdvancePayment,
          });
        });

        it('should search with Tabapay gateway API if bank funding type', async () => {
          const externalId = 'T4ECOVMVCQGO2aV6k6vYGg';
          const tabapayStub = sandbox.stub().resolves({
            type: PaymentProviderTransactionType.BankFunding,
            externalId,
            referenceId: 'test-ref-4',
            amount: 0.1,
            gateway: PaymentGateway.Tabapay,
            processor: PaymentProcessor.Tabapay,
            status: PaymentProviderTransactionStatus.Completed,
          });
          sandbox
            .stub(Loomis, 'getPaymentGateway')
            .withArgs(PaymentGateway.Tabapay)
            .returns({ fetchTransaction: tabapayStub });

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              externalId,
              transactionType: PaymentProviderTransactionType.BankFunding,
            });
          const res1 = await withInternalUser(req);
          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.externalId).to.equal(externalId);
          expect(transaction.amount).to.equal(0.1);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.gateway).to.equal(PaymentGateway.Tabapay);
          expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
          expect(tabapayStub.callCount).to.equal(1);
          expect(tabapayStub).to.have.been.calledWith({
            externalId,
            referenceId: undefined,
            type: PaymentProviderTransactionType.BankFunding,
          });
        });
      });

      context('search by Reference ID', () => {
        it('should search in gateway API and search for settlement record', async () => {
          const referenceId = 'tp-001';
          const externalId = '100058';
          const settlementAmount = 10;
          const settlementStatus = TransactionSettlementStatus.Canceled;

          await factory.create('transaction-settlement', {
            externalId,
            processor: PaymentProcessor.Tabapay,
            amount: settlementAmount,
            status: settlementStatus,
          });
          const tabapayStub = sandbox.stub().resolves({
            type: PaymentProviderTransactionType.AdvanceDisbursement,
            externalId,
            referenceId,
            amount: settlementAmount,
            gateway: PaymentGateway.Tabapay,
            processor: PaymentProcessor.Tabapay,
            status: PaymentProviderTransactionStatus.Completed,
          });
          const notFoundStub = sandbox.stub().resolves({
            status: PaymentProviderTransactionStatus.NotFound,
            externalId,
            referenceId: null,
            reversalStatus: null,
          });
          sandbox
            .stub(Loomis, 'getPaymentGateway')
            .returns({ fetchTransaction: notFoundStub })
            .withArgs(PaymentGateway.Tabapay)
            .returns({ fetchTransaction: tabapayStub })
            .withArgs(PaymentGateway.Synapsepay);

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              referenceId,
              transactionType: PaymentProviderTransactionType.AdvancePayment,
            });
          const res1 = await withInternalUser(req);

          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.externalId).to.equal(externalId);
          expect(transaction.referenceId).to.equal(referenceId);
          expect(transaction.amount).to.equal(settlementAmount);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.gateway).to.equal(PaymentGateway.Tabapay);
          expect(transaction.status).to.equal(settlementStatus);
          expect(transaction.isSettlement).to.equal(true);
          expect(tabapayStub.callCount).to.equal(1);
          expect(tabapayStub).to.have.been.calledWith({
            externalId: undefined,
            referenceId,
            type: PaymentProviderTransactionType.AdvancePayment,
          });
        });

        it('should return gateway API result if settlement record not found', async () => {
          const referenceId = 'tp-001';
          const tabapayStub = sandbox.stub().resolves({
            type: PaymentProviderTransactionType.AdvanceDisbursement,
            externalId: '100058',
            referenceId,
            amount: 0.1,
            gateway: PaymentGateway.Tabapay,
            processor: PaymentProcessor.Tabapay,
            status: PaymentProviderTransactionStatus.Completed,
          });
          const notFoundStub = sandbox.stub().resolves({
            status: PaymentProviderTransactionStatus.NotFound,
            referenceId,
            reversalStatus: null,
          });
          sandbox
            .stub(Loomis, 'getPaymentGateway')
            .returns({ fetchTransaction: notFoundStub })
            .withArgs(PaymentGateway.Tabapay)
            .returns({ fetchTransaction: tabapayStub })
            .withArgs(PaymentGateway.Synapsepay);

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              referenceId,
              transactionType: PaymentProviderTransactionType.AdvancePayment,
            });
          const res1 = await withInternalUser(req);

          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.externalId).to.equal('100058');
          expect(transaction.referenceId).to.equal(referenceId);
          expect(transaction.amount).to.equal(0.1);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.gateway).to.equal(PaymentGateway.Tabapay);
          expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
          expect(transaction.isSettlement).to.equal(false);
        });

        it('should search with Tabapay gateway API if bank funding type', async () => {
          const referenceId = 'tp-001';
          const tabapayStub = sandbox.stub().resolves({
            type: PaymentProviderTransactionType.BankFunding,
            externalId: '100058',
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

          const req = request(app)
            .get('/dashboard/external_transaction/search')
            .query({
              referenceId,
              transactionType: PaymentProviderTransactionType.BankFunding,
            });
          const res1 = await withInternalUser(req);
          const transaction = res1.body.results[0];

          expect(res1.status).to.equal(200);
          expect(transaction.referenceId).to.equal(referenceId);
          expect(transaction.amount).to.equal(0.1);
          expect(transaction.processor).to.equal(PaymentProcessor.Tabapay);
          expect(transaction.gateway).to.equal(PaymentGateway.Tabapay);
          expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
          expect(tabapayStub.callCount).to.equal(1);
          expect(tabapayStub).to.have.been.calledWith({
            externalId: undefined,
            referenceId,
            type: PaymentProviderTransactionType.BankFunding,
          });
        });
      });
    });
  });
});
