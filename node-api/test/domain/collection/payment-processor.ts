import { saveUpdatedProcessorStatus } from '../../../src/domain/collection/payment-processor';
import factory from '../../factories';
import { expect } from 'chai';
import { PaymentError, PaymentProcessorError } from '../../../src/lib/error';
import { clean } from '../../test-helpers';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('Payment Processor Helper', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('saveUpdatedProcessorStatus', () => {
    it('updates the payment status', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentProcessorError('synapsepay sucks', 'WESUCK', {
        data: {
          gateway: ExternalTransactionProcessor.Synapsepay,
          processorHttpStatus: 500,
        },
      });
      await saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload();
      expect(payment.status).to.eq(ExternalTransactionStatus.Unknown);
    });

    it('saves the externalProcessor', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentProcessorError('synapsepay sucks', 'WESUCK', {
        data: {
          gateway: ExternalTransactionProcessor.Synapsepay,
          processorHttpStatus: 500,
          processor: ExternalTransactionProcessor.Synapsepay,
        },
      });
      await saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload();
      expect(payment.externalProcessor).to.eq(ExternalTransactionProcessor.Synapsepay);
    });

    it('cancels and deletes the payment for unknown PaymentProcessorErrors', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentProcessorError('Unspecified error', 'Something');
      await saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.not.eq(null);
      expect(payment.status).to.eq(ExternalTransactionStatus.Canceled);
    });

    it('cancels and deletes the payment for PaymentErrors', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentError('Unspecified error');
      await saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.not.eq(null);
      expect(payment.status).to.eq(ExternalTransactionStatus.Canceled);
    });

    it('does not cancel or delete the payment for random non-PaymentErrors and non-PaymentProcessorErrors', async () => {
      const payment = await factory.create('payment');
      const err = new Error('Unspecified error');
      await saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.eq(null);
      expect(payment.status).to.not.eq(ExternalTransactionStatus.Canceled);
    });
  });
});
