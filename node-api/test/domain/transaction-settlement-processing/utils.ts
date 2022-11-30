import { expect } from 'chai';
import { Moment, moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';

import { clean } from '../../test-helpers';

import factory from '../../factories';

import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import * as TransactionSettlementUtils from '../../../src/domain/transaction-settlement-processing/utils';

const sandbox = sinon.createSandbox();

async function setupPaymentUpdates({
  created = moment().subtract(91, 'days'),
}: {
  created?: Moment;
} = {}) {
  const payment = await factory.create('payment', {
    status: ExternalTransactionStatus.Pending,
    created,
    updated: moment().subtract(61, 'days'),
  });

  /**
   * set up the sequence of automatic updates
   * that often happen before an admin sets
   * the transaction status to canceled
   */
  await payment.update({
    status: ExternalTransactionStatus.Completed,
  });
  await payment.update({
    status: ExternalTransactionStatus.Chargeback,
  });
  await payment.update({
    status: ExternalTransactionStatus.Pending,
  });

  return payment;
}

describe('TransactionSettlementUtils', () => {
  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('hasAdminCancelationOrCompletion', () => {
    it('should return true if admin canceled the payment and it is older than 90 days', async () => {
      const payment = await setupPaymentUpdates();

      /**
       * Trigger the admin update
       */
      await payment.update(
        {
          status: ExternalTransactionStatus.Canceled,
        },
        { metadata: { type: 'admin-update' } },
      );

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(payment);

      expect(result).to.equal(true);
    });

    it('should return true if admin completed the payment and it is older than 90 days', async () => {
      const payment = await setupPaymentUpdates();

      /**
       * Trigger the admin update
       */
      await payment.update(
        {
          status: ExternalTransactionStatus.Completed,
        },
        { metadata: { type: 'admin-update' } },
      );

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(payment);

      expect(result).to.equal(true);
    });

    it('should return false if there are no admin updates', async () => {
      const payment = await setupPaymentUpdates();

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(payment);

      expect(result).to.equal(false);
    });

    it('should return false if the payment is not old enough', async () => {
      const payment = await setupPaymentUpdates({ created: moment().subtract(10, 'days') });

      /**
       * Trigger the admin update
       */
      await payment.update(
        {
          status: ExternalTransactionStatus.Canceled,
        },
        { metadata: { type: 'admin-update' } },
      );

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(payment);

      expect(result).to.equal(false);
    });

    it('should return false for advances', async () => {
      const advance = await factory.create('advance');

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(advance);

      expect(result).to.equal(false);
    });

    it('should be compatible with subscriptionPayments', async () => {
      const subscriptionPayment = await factory.create('subscription-payment');

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(
        subscriptionPayment,
      );

      expect(result).to.equal(false);
    });

    it('should fail gracefully for transactionSettlement records', async () => {
      const transactionSettlement = await factory.create('transaction-settlement');

      const result = TransactionSettlementUtils.hasAdminCancelationOrCompletion(
        transactionSettlement,
      );

      expect(result).to.equal(false);
    });
  });
});
