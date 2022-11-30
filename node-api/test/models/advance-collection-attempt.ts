import * as Bluebird from 'bluebird';
import { expect } from 'chai';

import { clean } from '../test-helpers';
import factory from '../factories';

import { AdvanceCollectionAttempt, Payment } from '../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('AdvanceCollectionAttempt', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('scopes', () => {
    describe('successful', () => {
      it('includes collection attempts with a completed or pending payment', async () => {
        const pendingPayment = await factory.create<Payment>('payment', {
          status: ExternalTransactionStatus.Pending,
        });

        const successfulAttempts = await Promise.all([
          factory.create<AdvanceCollectionAttempt>('advance-collection-attempt', {
            paymentId: pendingPayment.id,
            processing: null,
          }),
          factory.create<AdvanceCollectionAttempt>('successful-advance-collection-attempt'),
        ]);

        const result = await AdvanceCollectionAttempt.scope('successful').findAll();
        const resultPayments = await Bluebird.map(result, att => att.getPayment());

        expect(successfulAttempts.map(att => att.id).sort()).to.deep.equal(
          result.map(att => att.id).sort(),
        );
        expect(
          resultPayments.filter(
            pmt =>
              pmt.status === ExternalTransactionStatus.Completed ||
              pmt.status === ExternalTransactionStatus.Pending,
          ).length,
        ).to.equal(2);
      });

      it('does NOT include collection attempts with a canceled, returned, or unknown status', async () => {
        const unsuccessfulPayments = await Promise.all([
          factory.create<Payment>('payment', {
            status: ExternalTransactionStatus.Canceled,
          }),
          factory.create<Payment>('payment', {
            status: ExternalTransactionStatus.Returned,
          }),
          factory.create<Payment>('payment', {
            status: ExternalTransactionStatus.Unknown,
          }),
        ]);

        const [
          [canceledAttempt, returnedAttempt, unknownAttempt],
          noPaymentAttempt,
          successfulAttempt,
        ] = await Promise.all([
          Bluebird.map(unsuccessfulPayments, pmt =>
            factory.create<AdvanceCollectionAttempt>('advance-collection-attempt', {
              paymentId: pmt.id,
            }),
          ),
          factory.create<AdvanceCollectionAttempt>('advance-collection-attempt'),
          factory.create<AdvanceCollectionAttempt>('successful-advance-collection-attempt'),
        ]);

        const result = await AdvanceCollectionAttempt.scope('successful').findAll();
        const resultIds = result.map(att => att.id);

        expect(resultIds.length).to.equal(1);
        expect(resultIds).to.include(successfulAttempt.id);
        expect(resultIds).to.not.include(canceledAttempt.id);
        expect(resultIds).to.not.include(returnedAttempt.id);
        expect(resultIds).to.not.include(unknownAttempt.id);
        expect(resultIds).to.not.include(noPaymentAttempt.id);
      });
    });
  });
});
