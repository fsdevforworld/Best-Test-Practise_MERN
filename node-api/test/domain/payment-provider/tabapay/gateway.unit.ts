import { replayHttp, TABAPAY_ACCOUNT_ID } from '../../../test-helpers';
import TabapayGateway from '../../../../src/domain/payment-provider/tabapay/gateway';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '../../../../src/typings';
import { expect } from 'chai';

const { AdvanceDisbursement, AdvancePayment, SubscriptionPayment } = PaymentProviderTransactionType;

const fixtureDir = '/domain/payment-provider/tabapay/gateway';

describe('TabapayGateway', () => {
  const expectedGateway = PaymentGateway.Tabapay;
  const expectedProcessor = PaymentProcessor.Tabapay;

  describe('createTransaction', () => {
    const testSourceId = TABAPAY_ACCOUNT_ID;
    it(
      `creates an ${AdvanceDisbursement}`,
      replayHttp(`${fixtureDir}/create-${AdvanceDisbursement}.json`, async () => {
        const referenceId = '2019-04-09-005';
        const amount = 0.1;
        const expectedApprovalCode = '178298';
        const expectedSettlementNetwork = 'STAR';
        const expectedNetworkId = '122951436';

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: AdvanceDisbursement,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction).to.deep.include({
          amount,
          gateway: expectedGateway,
          network: {
            approvalCode: expectedApprovalCode,
            settlementNetwork: expectedSettlementNetwork,
            networkId: expectedNetworkId,
          },
          referenceId,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Completed,
          type: AdvanceDisbursement,
        });
      }),
    );

    it(
      `creates an ${AdvancePayment}`,
      replayHttp(`${fixtureDir}/create-${AdvancePayment}.json`, async () => {
        const referenceId = '2019-04-09-008';
        const amount = 0.1;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: AdvancePayment,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction).to.include({
          referenceId,
          amount,
          type: AdvancePayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Completed,
        });
      }),
    );

    it(
      `creates a ${SubscriptionPayment}`,
      replayHttp(`${fixtureDir}/create-${SubscriptionPayment}.json`, async () => {
        const referenceId = '2019-04-09-008';
        const amount = 0.1;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: SubscriptionPayment,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction).to.include({
          referenceId,
          amount,
          type: SubscriptionPayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Completed,
        });
      }),
    );

    it(
      'returns declined transactions',
      replayHttp(`${fixtureDir}/create-declined.json`, async () => {
        const referenceId = '2019-04-09-014';
        const amount = 0.01;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: SubscriptionPayment,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction).to.include({
          referenceId,
          amount,
          type: SubscriptionPayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Canceled,
        });
      }),
    );

    it(
      'returns transaction with the status of INVALID_REQUEST when the Tabapay response code is 400',
      replayHttp(`${fixtureDir}/create-invalid-source.json`, async () => {
        const referenceId = '2019-04-10-000';
        const invalidSourceId = 'blah-blah-blah';
        const amount = 0.1;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: invalidSourceId,
          type: AdvancePayment,
        });

        expect(transaction).to.include({
          referenceId,
          amount,
          type: AdvancePayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.InvalidRequest,
        });
      }),
    );

    it(
      'sets the status to Pending when Tabapay experiences upstream processing errors',
      replayHttp(`${fixtureDir}/create-with-timeout.json`, async () => {
        const referenceId = '2019-04-10-003';
        const amount = 0.04;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: AdvancePayment,
        });

        expect(transaction.externalId).to.be.a('string');
        expect(transaction).to.include({
          referenceId,
          amount,
          type: AdvancePayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'returns a transaction with a status of INVALID_REQUEST when the response status code is 409',
      replayHttp(`${fixtureDir}/conflict.json`, async () => {
        const referenceId = '2019-04-10-003';
        const amount = 0.1;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId: testSourceId,
          type: AdvancePayment,
        });

        expect(transaction).to.include({
          referenceId,
          amount,
          type: AdvancePayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.InvalidRequest,
        });
      }),
    );
  });

  describe('fetchTransaction', () => {
    it(
      'retrieves with an externalId',
      replayHttp('tabapay/external-id.json', async () => {
        const externalId = 'T4ECOVMVCQGO2aV6k6vYGg';

        const transaction = await TabapayGateway.fetchTransaction({
          externalId,
          type: PaymentProviderTransactionType.AdvancePayment,
        });

        expect(transaction.externalId, 'externalId').to.equal(externalId);
        expect(transaction.referenceId, 'referenceId').to.equal('test-ref-4');
        expect(transaction.amount, 'amount').to.equal(0.1);
        expect(transaction.processor, 'processor').to.equal(PaymentProcessor.Tabapay);
        expect(transaction.gateway, 'gateway').to.equal(PaymentGateway.Tabapay);
        expect(transaction.status, 'status').to.equal(PaymentProviderTransactionStatus.Completed);
      }),
    );

    it(
      'retreives with a referenceId',
      replayHttp('tabapay/reference-id.json', async () => {
        const referenceId = 'test-ref-4';

        const transaction = await TabapayGateway.fetchTransaction({
          referenceId,
          type: PaymentProviderTransactionType.AdvancePayment,
        });

        expect(transaction.externalId, 'externalId').to.equal('T4ECOVMVCQGO2aV6k6vYGg');
        expect(transaction.referenceId, 'referenceId').to.equal('test-ref-4');
        expect(transaction.amount, 'amount').to.equal(0.1);
        expect(transaction.processor, 'processor').to.equal(PaymentProcessor.Tabapay);
        expect(transaction.gateway, 'gateway').to.equal(PaymentGateway.Tabapay);
        expect(transaction.status, 'status').to.equal(PaymentProviderTransactionStatus.Completed);
      }),
    );

    it(
      'retreives a membership transaction',
      replayHttp('tabapay/membership.json', async () => {
        const referenceId = 'test-ref-12';

        const transaction = await TabapayGateway.fetchTransaction({
          referenceId,
          type: SubscriptionPayment,
        });

        expect(transaction.externalId, 'externalId').to.equal('g0wTHlAF2KvH0ps_foq9vA');
        expect(transaction.referenceId, 'referenceId').to.equal('test-ref-12');
        expect(transaction.amount, 'amount').to.equal(0.03);
        expect(transaction.processor, 'processor').to.equal(PaymentProcessor.Tabapay);
        expect(transaction.gateway, 'gateway').to.equal(PaymentGateway.Tabapay);
        expect(transaction.status, 'status').to.equal(PaymentProviderTransactionStatus.Completed);
      }),
    );

    it(
      'return a transaction with a status of NOT_FOUND when no transaction exists for the external ID',
      replayHttp('tabapay/not-found.json', async () => {
        const externalId = 'not-there';

        const transaction = await TabapayGateway.fetchTransaction({
          externalId,
          type: SubscriptionPayment,
        });

        expect(transaction).to.include({
          externalId,
          type: SubscriptionPayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.NotFound,
        });
      }),
    );

    it(
      'return a transaction with a status of NOT_FOUND when no transaction exists for the referenceId',
      replayHttp(`${fixtureDir}/fetch-bad-reference-id.json`, async () => {
        const referenceId = 'not-there-foo';

        const transaction = await TabapayGateway.fetchTransaction({
          referenceId,
          type: SubscriptionPayment,
        });

        expect(transaction).to.include({
          referenceId,
          type: SubscriptionPayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.NotFound,
        });
      }),
    );

    it(
      'includes the decline code for failed transactions',
      replayHttp('tabapay/declined.json', async () => {
        const referenceId = 'test-ref-3';

        const transaction = await TabapayGateway.fetchTransaction({
          referenceId,
          type: AdvancePayment,
        });

        expect(transaction.externalId, 'externalId').to.equal('D0EBCloECSftVH4RElZmvg');
        expect(transaction.referenceId, 'referenceId').to.equal(referenceId);
        expect(transaction.amount, 'amount').to.equal(0.01);
        expect(transaction.processor, 'processor').to.equal(PaymentProcessor.Tabapay);
        expect(transaction.gateway, 'gateway').to.equal(PaymentGateway.Tabapay);
        expect(transaction.status, 'status').to.equal(PaymentProviderTransactionStatus.Canceled);
        expect(transaction.outcome.code).to.equal('ZZ');
      }),
    );

    it(
      'sets the correct status for successful reversals',
      replayHttp('tabapay/reversed.json', async () => {
        const externalId = 'Q40CPMiF0U0M_glP1QHbfQ';

        const transaction = await TabapayGateway.fetchTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
        expect(transaction.reversalStatus).to.equal(ReversalStatus.Completed);
      }),
    );

    it(
      'sets the correct status for failed reversals',
      replayHttp('tabapay/reversal.json', async () => {
        const externalId = 'y4UjLVeE2SFgloLil7ovpg';

        const transaction = await TabapayGateway.fetchTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
        expect(transaction.reversalStatus).to.equal(ReversalStatus.Failed);
      }),
    );

    it(
      'sets the correct status for successful reversals for Dual Message Networks',
      replayHttp('tabapay/reversed-dm.json', async () => {
        const externalId = 'y4kCHd6UUQG_KBESNw0csQ';

        const transaction = await TabapayGateway.fetchTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.status).to.equal(PaymentProviderTransactionStatus.Completed);
        expect(transaction.reversalStatus).to.equal(ReversalStatus.Completed);
      }),
    );
  });

  describe('reverseTransaction', () => {
    it(
      'successfully reverses the transaction',
      replayHttp('tabapay/reverse-success.json', async () => {
        const externalId = 'T5YSO0fFWSXDvk7AMh0ExA';

        const transaction = await TabapayGateway.reverseTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.reversalStatus).to.equal(ReversalStatus.Completed);
      }),
    );

    it(
      'includes the failed reversal status on a failed reversal',
      replayHttp(`${fixtureDir}/reverse-failed.json`, async () => {
        const externalId = 'h6cwTBkViKeh9ZDzb0nOOg';

        const transaction = await TabapayGateway.reverseTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.reversalStatus).to.equal(ReversalStatus.Failed);
      }),
    );

    it(
      'handles a network error on a failed reversal',
      replayHttp(`${fixtureDir}/reverse-failed-networ-error.json`, async () => {
        const externalId = 'h6cwTBkViKeh9ZDzb0nOOg';

        const transaction = await TabapayGateway.reverseTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.reversalStatus).to.equal(ReversalStatus.Failed);
      }),
    );
  });
});
