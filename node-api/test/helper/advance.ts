import { expect } from 'chai';
import * as sinon from 'sinon';
import AdvanceHelper from '../../src/helper/advance';
import { PaymentError, PaymentProcessorError } from '../../src/lib/error';
import factory from '../factories';
import {
  advanceFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../fixtures';
import { clean, stubBankTransactionClient, up } from '../test-helpers';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as CollectionDomain from '../../src/domain/collection';
import { insertFixtureBankTransactions } from '../test-helpers/bank-transaction-fixtures';
import * as Notification from '../../src/domain/notifications';
import { Advance } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../../src/lib/sequelize';

describe('Advance', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up([
      userFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      paymentMethodFixture,
      advanceFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  describe('saveUpdatedProcessorStatus', () => {
    it('updates the payment status', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentProcessorError('synapsepay sucks', 'WESUCK', {
        data: {
          gateway: ExternalTransactionProcessor.Synapsepay,
          processorHttpStatus: 500,
        },
      });
      await CollectionDomain.saveUpdatedProcessorStatus(payment, err, 'testing');
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
      await CollectionDomain.saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload();
      expect(payment.externalProcessor).to.eq(ExternalTransactionProcessor.Synapsepay);
    });

    it('cancels and deletes the payment for unknown PaymentProcessorErrors', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentProcessorError('Unspecified error', 'Something');
      await CollectionDomain.saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.not.eq(null);
      expect(payment.status).to.eq(ExternalTransactionStatus.Canceled);
    });

    it('cancels and deletes the payment for PaymentErrors', async () => {
      const payment = await factory.create('payment');
      const err = new PaymentError('Unspecified error');
      await CollectionDomain.saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.not.eq(null);
      expect(payment.status).to.eq(ExternalTransactionStatus.Canceled);
    });

    it('does not cancel or delete the payment for random non-PaymentErrors and non-PaymentProcessorErrors', async () => {
      const payment = await factory.create('payment');
      const err = new Error('Unspecified error');
      await CollectionDomain.saveUpdatedProcessorStatus(payment, err, 'testing');
      await payment.reload({ paranoid: false });
      expect(payment.deleted).to.eq(null);
      expect(payment.status).to.not.eq(ExternalTransactionStatus.Canceled);
    });
  });

  describe('updateDisbursementStatus', () => {
    it('updates advance with correct status', async () => {
      const advance = await factory.create('advance');
      await AdvanceHelper.updateDisbursementStatus(advance, ExternalTransactionStatus.Completed);
      expect(advance.disbursementStatus).to.be.equal(ExternalTransactionStatus.Completed);
      expect(advance.deleted).to.be.sameMoment(moment(ACTIVE_TIMESTAMP));
    });

    it('updates advance with existing payments to correct outstanding when canceled', async () => {
      const user = await factory.create('user');
      const advance = await factory.create('advance');
      await factory.create('payment', { advanceId: advance.id, userId: user.id, amount: 10 });
      await AdvanceHelper.updateDisbursementStatus(advance, ExternalTransactionStatus.Canceled, {
        sendNotification: false,
      });
      expect(advance.outstanding).to.be.equal(-10);
    });

    [ExternalTransactionStatus.Canceled, ExternalTransactionStatus.Returned].forEach(status => {
      describe(`when advance ${status}`, () => {
        let advance: Advance;
        beforeEach(async () => {
          advance = await factory.create('advance');
          await factory.create('advance-tip', { advanceId: advance.id });
        });

        it('sends notification', async () => {
          const notificationSpy = sandbox.stub(Notification, 'sendAdvanceDisbursementFailed');
          await AdvanceHelper.updateDisbursementStatus(advance, status);
          sinon.assert.calledOnce(notificationSpy);
        });

        it('does not send notification when sendNotification option false', async () => {
          const notificationSpy = sandbox.stub(Notification, 'sendAdvanceDisbursementFailed');
          await AdvanceHelper.updateDisbursementStatus(advance, status, {
            sendNotification: false,
          });
          sinon.assert.notCalled(notificationSpy);
        });

        it('updates and deletes advances', async () => {
          await AdvanceHelper.updateDisbursementStatus(advance, status, {
            sendNotification: false,
          });
          expect(advance.disbursementStatus).to.be.equal(status);
          expect(advance.deleted).to.exist;
        });
      });
    });
  });
});
