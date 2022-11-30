import { PaymentProviderDelivery } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import BankOfDaveInternalApiGateway from '../../../../src/domain/payment-provider/bank-of-dave-internal-api/gateway';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '../../../../src/typings';
import { replayHttp } from '../../../test-helpers';

const fixtureDirectory = 'domain/payment-provider/bank-of-dave-internal-api';
const { AdvanceDisbursement, AdvancePayment, SubscriptionPayment } = PaymentProviderTransactionType;

describe('BankOfDaveInternalApiGateway', () => {
  const testUserId = '2a82e635-d1dd-46c1-bc82-56f722a6e698';
  const testDaveUserId = 7337;
  const testSourceId = '0b39346b-9b00-4aee-a11e-0428fd13df81';
  const expectedProcessor = PaymentProcessor.BankOfDave;
  const expectedGateway = PaymentGateway.BankOfDave;

  describe('createTransaction', () => {
    it(
      'creates an advance-disbursement',
      replayHttp(`${fixtureDirectory}/create-advance-disbursement.json`, async () => {
        const referenceId = 'pelican-can-can-0004';
        const amount = 75;

        const transaction = await BankOfDaveInternalApiGateway.createTransaction({
          type: AdvanceDisbursement,
          ownerId: testUserId,
          sourceId: testSourceId,
          referenceId,
          amount,
          delivery: PaymentProviderDelivery.STANDARD,
        });

        expect(transaction.externalId).to.equal('fb5328fa-7da8-488b-bec7-0b5e0079c834');
        expect(transaction).to.include({
          type: AdvanceDisbursement,
          referenceId,
          amount,
          processor: expectedProcessor,
          gateway: expectedGateway,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'creates an express advance-disbursement',
      replayHttp(`${fixtureDirectory}/create-express-advance-disbursement.json`, async () => {
        const referenceId = 'pelican-can-can-0005';
        const amount = 75;

        const transaction = await BankOfDaveInternalApiGateway.createTransaction({
          type: AdvanceDisbursement,
          ownerId: testUserId,
          sourceId: testSourceId,
          referenceId,
          amount,
          delivery: PaymentProviderDelivery.EXPRESS,
        });

        expect(transaction.externalId).to.equal('784a8620-c8a2-4512-ac36-fac801a2434b');
        expect(transaction).to.include({
          type: AdvanceDisbursement,
          referenceId,
          amount,
          processor: expectedProcessor,
          gateway: expectedGateway,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'creates an advance-disbursement with no delivery option',
      replayHttp(`${fixtureDirectory}/create-advance-disbursement.json`, async () => {
        const referenceId = 'pelican-can-can-0004';
        const amount = 75;

        const transaction = await BankOfDaveInternalApiGateway.createTransaction({
          type: AdvanceDisbursement,
          ownerId: testUserId,
          sourceId: testSourceId,
          referenceId,
          amount,
        });

        expect(transaction.externalId).to.equal('fb5328fa-7da8-488b-bec7-0b5e0079c834');
        expect(transaction).to.include({
          type: AdvanceDisbursement,
          referenceId,
          amount,
          processor: expectedProcessor,
          gateway: expectedGateway,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'creates a subscription-payment',
      replayHttp(`${fixtureDirectory}/create-subscription-payment.json`, async () => {
        const referenceId = 'pelican-123-0002';
        const amount = 1;
        const expectedId = 'a7991145-f1c7-4d43-933c-b46d60952b17';

        const transaction = await BankOfDaveInternalApiGateway.createTransaction({
          type: SubscriptionPayment,
          ownerId: testUserId,
          sourceId: testSourceId,
          referenceId,
          amount,
        });

        expect(transaction.externalId).to.equal(expectedId);
        expect(transaction).to.include({
          type: SubscriptionPayment,
          referenceId,
          amount,
          processor: expectedProcessor,
          gateway: expectedGateway,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );

    it(
      'creates an advance-payment',
      replayHttp(`${fixtureDirectory}/create-advance-payment.json`, async () => {
        const referenceId = 'pelican-123-0005';
        const amount = 20;
        const loanId = '8e490978-525b-4760-bf59-ba28a28b3545';
        const expectedId = 'f5aa333d-58f4-4387-8aa2-47c7ea9abf54';

        const transaction = await BankOfDaveInternalApiGateway.createTransaction({
          type: AdvancePayment,
          ownerId: testUserId,
          sourceId: testSourceId,
          correspondingId: loanId,
          referenceId,
          amount,
        });

        expect(transaction.externalId).to.equal(expectedId);
        expect(transaction).to.include({
          type: AdvancePayment,
          referenceId,
          amount,
          processor: expectedProcessor,
          gateway: expectedGateway,
          status: PaymentProviderTransactionStatus.Pending,
        });
      }),
    );
  });

  describe('fetchTransaction', () => {
    describe(AdvanceDisbursement, () => {
      const advanceReferenceId = 'tl-0000-0000';
      const expectedTransaction: PaymentProviderTransaction = {
        type: AdvanceDisbursement,
        externalId: 'f0100d36-7cbd-47f4-beb3-280aa2fb0768',
        referenceId: advanceReferenceId,
        status: PaymentProviderTransactionStatus.Completed,
        processor: expectedProcessor,
        gateway: expectedGateway,
        reversalStatus: null,
        amount: 75,
      };

      it(
        'retrieves by referenceId',
        replayHttp(
          `${fixtureDirectory}/fetch-${AdvanceDisbursement}-reference-id.json`,
          async () => {
            const transaction = await BankOfDaveInternalApiGateway.fetchTransaction({
              referenceId: advanceReferenceId,
              ownerId: testSourceId,
              sourceId: testSourceId,
              type: PaymentProviderTransactionType.AdvanceDisbursement,
              daveUserId: testDaveUserId,
            });

            expect(transaction).to.include(expectedTransaction);
          },
        ),
      );

      it(
        'handles not found error',
        replayHttp(`${fixtureDirectory}/fetch-${AdvanceDisbursement}-not-found.json`, async () => {
          const response = await BankOfDaveInternalApiGateway.fetchTransaction({
            referenceId: advanceReferenceId,
            ownerId: testSourceId,
            sourceId: testSourceId,
            type: PaymentProviderTransactionType.AdvanceDisbursement,
            daveUserId: testDaveUserId,
          });

          expect(response.status).to.equal(PaymentProviderTransactionStatus.NotFound);
        }),
      );
    });

    describe(AdvancePayment, () => {
      const advanceReferenceId = 'tl-0000-0001';
      const expectedTransaction: PaymentProviderTransaction = {
        type: AdvancePayment,
        externalId: 'f0100d36-7cbd-47f4-beb3-280aa2fb0768',
        referenceId: advanceReferenceId,
        status: PaymentProviderTransactionStatus.Completed,
        processor: expectedProcessor,
        gateway: expectedGateway,
        reversalStatus: null,
        amount: 75,
      };

      const advanceExternalId = 'be67e6d1-3494-4fb0-b523-e0c5422b5ee7';

      it(
        'retrieves by referenceId',
        replayHttp(`${fixtureDirectory}/fetch-advance-payment-by-reference-id.json`, async () => {
          const transaction = await BankOfDaveInternalApiGateway.fetchTransaction({
            referenceId: advanceReferenceId,
            ownerId: testSourceId,
            sourceId: testSourceId,
            type: AdvancePayment,
            correspondingId: advanceExternalId,
            daveUserId: testDaveUserId,
          });

          expect(transaction).to.include(expectedTransaction);
        }),
      );
    });

    describe(SubscriptionPayment, () => {
      const subscriptionReferenceId = 'tcp-0000-0000';
      const expectedTransaction: PaymentProviderTransaction = {
        type: SubscriptionPayment,
        externalId: 'c80a4734-130d-4299-8d92-c67b25a3ffc7',
        referenceId: subscriptionReferenceId,
        status: PaymentProviderTransactionStatus.Completed,
        amount: 1,
        processor: expectedProcessor,
        gateway: expectedGateway,
        reversalStatus: null,
      };

      it(
        'retrieves by referenceId',
        replayHttp(
          `${fixtureDirectory}/fetch-${SubscriptionPayment}-by-reference-id.json`,
          async () => {
            const transaction = await BankOfDaveInternalApiGateway.fetchTransaction({
              referenceId: subscriptionReferenceId,
              ownerId: testSourceId,
              sourceId: testSourceId,
              type: SubscriptionPayment,
              daveUserId: testDaveUserId,
            });

            expect(transaction).to.include(expectedTransaction);
          },
        ),
      );
    });
  });

  describe('reverseTransaction', () => {
    it(
      'reverses an advance-payment',
      replayHttp(`${fixtureDirectory}/reverse-advance-payment.json`, async () => {
        const loanId = '72e0a87d-0824-4a9d-af11-275ea886789d';
        const paymentId = '9762e1d0-2f4a-4241-a09d-a318f1842285';

        const transaction = await BankOfDaveInternalApiGateway.reverseTransaction({
          type: AdvancePayment,
          externalId: paymentId,
          correspondingId: loanId,
          ownerId: paymentId,
          sourceId: testSourceId,
          daveUserId: testDaveUserId,
        });

        expect(transaction).to.include({
          status: PaymentProviderTransactionStatus.Completed,
          reversalStatus: ReversalStatus.Pending,
        });
      }),
    );

    it(
      `reverses a ${SubscriptionPayment}`,
      replayHttp(`${fixtureDirectory}/reverse-${SubscriptionPayment}.json`, async () => {
        const paymentId = 'e2444397-4c3a-4387-93df-b253ce33c291';

        const transaction = await BankOfDaveInternalApiGateway.reverseTransaction({
          type: SubscriptionPayment,
          externalId: paymentId,
          ownerId: testUserId,
          sourceId: testSourceId,
          correspondingId: paymentId,
          daveUserId: testDaveUserId,
        });

        expect(transaction).to.include({
          status: PaymentProviderTransactionStatus.Completed,
          reversalStatus: ReversalStatus.Pending,
        });
      }),
    );
  });
});
