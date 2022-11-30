import { replayHttp } from '../../../test-helpers';
import TabapayGateway from '../../../../src/domain/payment-provider/tabapay-ach/gateway';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '../../../../src/typings';
import factory from '../../../factories';
import { expect } from 'chai';
import gcloudKms from '../../../../src/lib/gcloud-kms';

const { AdvanceDisbursement, AdvancePayment, SubscriptionPayment } = PaymentProviderTransactionType;

const fixtureDir = '/domain/payment-provider/tabapay-ach';

describe.skip('TabapayGateway', () => {
  const expectedGateway = PaymentGateway.TabapayACH;
  const expectedProcessor = PaymentProcessor.TabapayACH;

  describe('createTransaction', () => {
    let accountNumberAes256: string;
    let sourceId: string;

    before(async () => {
      accountNumberAes256 = (await gcloudKms.encrypt(`${123456789}|${123456}`)).ciphertext;
      const bankAccount = await factory.create('bank-account', {
        accountNumberAes256,
        subtype: 'CHECKING',
      });
      sourceId = bankAccount.id.toString();
    });

    it(
      `creates an ${AdvanceDisbursement}`,
      replayHttp(`${fixtureDir}/create-${AdvanceDisbursement}.json`, async () => {
        const referenceId = '2sadlgk0823lasgd';
        const amount = 75;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId,
          type: AdvanceDisbursement,
        });

        expect(transaction).to.deep.include({
          amount,
          gateway: expectedGateway,
          referenceId,
          externalId: 'wDA3NYwFgQ2BN04SeqkbKw',
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Pending,
          type: AdvanceDisbursement,
        });
      }),
    );

    it(
      `creates an ${AdvancePayment}`,
      replayHttp(`${fixtureDir}/create-${AdvancePayment}.json`, async () => {
        const referenceId = '2sadlgk0823lasgd';
        const amount = 75;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId,
          type: AdvancePayment,
        });

        expect(transaction).to.include({
          referenceId,
          externalId: 'wDA3NYwFgQ2BN04SeqkbKw',
          amount,
          type: AdvancePayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      `creates a ${SubscriptionPayment}`,
      replayHttp(`${fixtureDir}/create-${SubscriptionPayment}.json`, async () => {
        const referenceId = '2sadlgk0823lasgd';
        const amount = 1;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId,
          type: SubscriptionPayment,
        });

        expect(transaction).to.include({
          referenceId,
          externalId: 'wDA3NYwFgQ2BN04SeqkbKw',
          amount,
          type: SubscriptionPayment,
          gateway: expectedGateway,
          processor: expectedProcessor,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'sets the status to Pending when Tabapay experiences upstream processing errors',
      replayHttp(`${fixtureDir}/create-with-timeout.json`, async () => {
        const referenceId = '2sadlgk0823lasgd';
        const amount = 75;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId,
          type: AdvancePayment,
        });

        expect(transaction).to.include({
          referenceId,
          externalId: 'CLA2BpwUCQukR6Vo0ArGdQ',
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
        const referenceId = '2sadlgk0823lasgd';
        const amount = 10;

        const transaction = await TabapayGateway.createTransaction({
          amount,
          referenceId,
          sourceId,
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

    it('throws Invalid Paramters error for invalid bank account id', async () => {
      const referenceId = '2sadlgk0823lasgd';
      const amount = 75;
      const invalidSourceId = 'asdghasdvn';

      await TabapayGateway.createTransaction({
        amount,
        referenceId,
        sourceId: invalidSourceId,
        type: AdvancePayment,
      }).catch(error => {
        expect(error.name).to.equal('InvalidParametersError');
        expect(error.message).to.equal('Missing valid bank account id');
      });
    });

    it('throws Invalid Paramters error for invalid bank account subtype', async () => {
      const referenceId = '2sadlgk0823lasgd';
      const amount = 75;

      const bankAccount = await factory.create('bank-account', {
        accountNumberAes256,
        subtype: 'SAVINGS',
      });

      await TabapayGateway.createTransaction({
        amount,
        referenceId,
        sourceId: bankAccount.id,
        type: AdvancePayment,
      }).catch(error => {
        expect(error.name).to.equal('InvalidParametersError');
        expect(error.message).to.equal('Not a supported bank account type: SAVINGS');
      });
    });
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
        expect(transaction.processor, 'processor').to.equal(expectedProcessor);
        expect(transaction.gateway, 'gateway').to.equal(expectedGateway);
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
        expect(transaction.processor, 'processor').to.equal(expectedProcessor);
        expect(transaction.gateway, 'gateway').to.equal(expectedGateway);
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
        expect(transaction.processor, 'processor').to.equal(expectedProcessor);
        expect(transaction.gateway, 'gateway').to.equal(expectedGateway);
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
      'return a transaction with a status of NOT_FOUND when no transaction exists for the reference ID',
      replayHttp(
        'domain/payment-provider/tabapay/gateway/fetch-bad-reference-id.json',
        async () => {
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
        },
      ),
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
        expect(transaction.processor, 'processor').to.equal(expectedProcessor);
        expect(transaction.gateway, 'gateway').to.equal(expectedGateway);
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
  });

  describe('reverseTransaction', () => {
    it(
      'should successfully reverse a transaction',
      replayHttp('tabapay/reverse-success.json', async () => {
        const externalId = 'T5YSO0fFWSXDvk7AMh0ExA';

        const transaction = await TabapayGateway.reverseTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.reversalStatus).to.equal(ReversalStatus.Completed);
        expect(transaction.processor).to.equal(expectedProcessor);
        expect(transaction.gateway).to.equal(expectedGateway);
      }),
    );

    it(
      'should include a failed reversal status for a failed reversal',
      replayHttp('domain/payment-provider/tabapay/gateway/reverse-failed.json', async () => {
        const externalId = 'h6cwTBkViKeh9ZDzb0nOOg';

        const transaction = await TabapayGateway.reverseTransaction({
          externalId,
          type: AdvancePayment,
        });

        expect(transaction.reversalStatus).to.equal(ReversalStatus.Failed);
        expect(transaction.processor).to.equal(expectedProcessor);
        expect(transaction.gateway).to.equal(expectedGateway);
      }),
    );

    it(
      'should handle a network error on a failed reversal',
      replayHttp(
        'domain/payment-provider/tabapay/gateway/reverse-failed-network-error.json',
        async () => {
          const externalId = 'h6cwTBkViKeh9ZDzb0nOOg';

          const transaction = await TabapayGateway.reverseTransaction({
            externalId,
            type: AdvancePayment,
          });

          expect(transaction.reversalStatus).to.equal(ReversalStatus.Failed);
          expect(transaction.processor).to.equal(expectedProcessor);
          expect(transaction.gateway).to.equal(expectedGateway);
        },
      ),
    );
  });
});
