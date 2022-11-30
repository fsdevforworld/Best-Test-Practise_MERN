import { expect } from 'chai';
import 'chai-as-promised';
import * as sinon from 'sinon';

import {
  detectFirstRecurringPaycheck,
  DetectFirstRecurringPaycheckError,
  DetectFirstRecurringPaycheckErrorReason,
} from '../../../src/domain/dave-banking/detect-first-recurring-paycheck';
import { BankAccount, BankConnection, BankConnectionTransition } from '../../../src/models';
import { MINIMUM_PAYCHECK_AMOUNT } from '../../../src/services/advance-approval/advance-approval-engine';
import { moment } from '@dave-inc/time-lib';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import factory from '../../factories';
import { clean } from '../../test-helpers';

const { NOT_VALIDATED } = RecurringTransactionStatus;
const { EXPENSE, INCOME } = TransactionType;

describe('detectFirstRecurringPaycheck', () => {
  before(() => clean());

  context('when the first recurring paycheck is not detected', () => {
    afterEach(() => clean());

    it('should not fetch recurring transactions marked as an expense', async () => {
      const promise = detectFirstRecurringPaycheck({ recurringTransactionId: 1, type: EXPENSE });
      await expectErrorReason(promise, DetectFirstRecurringPaycheckErrorReason.TYPE_NOT_INCOME);
    });

    it('should discard nonexistant recurring transactions', async () => {
      const promise = detectFirstRecurringPaycheck({ recurringTransactionId: 1, type: INCOME });
      const error = await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.RECURRING_TRANSACTION_NOT_ELIGIBLE,
      );
      expect(error.data?.isMissed).to.be.undefined;
      expect(error.data?.status).to.be.undefined;
      expect(error.data?.type).to.be.undefined;
      expect(error.data?.userAmount).to.be.undefined;
    });

    it('should discard invalid recurring transactions', async () => {
      await factory.create('recurring-transaction', {
        id: 1,
        status: NOT_VALIDATED,
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT,
      });
      const promise = detectFirstRecurringPaycheck({ recurringTransactionId: 1, type: INCOME });
      const error = await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.RECURRING_TRANSACTION_NOT_ELIGIBLE,
      );
      expect(error.data?.isMissed).to.not.be.undefined;
      expect(error.data?.status).to.not.be.undefined;
      expect(error.data?.type).to.not.be.undefined;
      expect(error.data?.userAmount).to.not.be.undefined;
    });

    it(`should discard income with recurring transactions of less than $${MINIMUM_PAYCHECK_AMOUNT}`, async () => {
      await factory.create('recurring-transaction', {
        id: 1,
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT - 1,
      });

      const promise = detectFirstRecurringPaycheck({
        recurringTransactionId: 1,
        type: INCOME,
      });
      const error = await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.RECURRING_TRANSACTION_NOT_ELIGIBLE,
      );
      expect(error.data?.isMissed).to.not.be.undefined;
      expect(error.data?.status).to.not.be.undefined;
      expect(error.data?.type).to.not.be.undefined;
      expect(error.data?.userAmount).to.not.be.undefined;
    });

    it(`should discard income with recurring transactions missing`, async () => {
      await factory.create('recurring-transaction', {
        id: 1,
        missed: moment(),
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT,
      });

      const promise = detectFirstRecurringPaycheck({
        recurringTransactionId: 1,
        type: INCOME,
      });
      const error = await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.RECURRING_TRANSACTION_NOT_ELIGIBLE,
      );
      expect(error.data?.isMissed).to.not.be.undefined;
      expect(error.data?.status).to.not.be.undefined;
      expect(error.data?.type).to.not.be.undefined;
      expect(error.data?.userAmount).to.not.be.undefined;
    });

    it('should discard nonexistant bank connection transitions', async () => {
      await factory.create('recurring-transaction', {
        id: 1,
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT,
      });

      const promise = detectFirstRecurringPaycheck({
        recurringTransactionId: 1,
        type: INCOME,
      });
      await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.NO_BANK_CONNECTION_TRANSITION,
      );
    });

    it('should discard non-DaveBanking bank connections', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      await factory.create<BankConnectionTransition>('bank-connection-transition', {
        hasReceivedFirstPaycheck: false,
        toBankConnectionId: bankAccount.bankConnectionId,
      });
      const { id: bankAccountId, userId } = bankAccount;
      await factory.create('recurring-transaction', {
        bankAccountId,
        id: 1,
        userId,
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT,
      });

      const promise = detectFirstRecurringPaycheck({
        recurringTransactionId: 1,
        type: INCOME,
      });
      await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.BANK_CONNECTION_NOT_ELIGIBLE,
      );
    });

    it('should discard bank connection transitions with hasReceivedFirstPaycheck = true', async () => {
      const bankConnection = await factory.create<BankConnection>('bank-of-dave-bank-connection');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      await factory.create<BankConnectionTransition>('bank-connection-transition', {
        hasReceivedFirstPaycheck: true,
        toBankConnectionId: bankAccount.bankConnectionId,
      });
      const { id: bankAccountId, userId } = bankAccount;
      await factory.create('recurring-transaction', {
        bankAccountId,
        id: 1,
        userId,
        type: INCOME,
        userAmount: MINIMUM_PAYCHECK_AMOUNT,
      });

      const promise = detectFirstRecurringPaycheck({
        recurringTransactionId: 1,
        type: INCOME,
      });
      await expectErrorReason(
        promise,
        DetectFirstRecurringPaycheckErrorReason.BANK_CONNECTION_NOT_ELIGIBLE,
      );
    });
  });

  context('when first recurring paycheck is detected', () => {
    let bankConnection: BankConnection;
    let bankConnectionTransition: BankConnectionTransition;
    const sandbox = sinon.createSandbox();
    const userAmount = MINIMUM_PAYCHECK_AMOUNT;

    before(async () => {
      bankConnection = await factory.create<BankConnection>('bank-of-dave-bank-connection');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });
      bankConnectionTransition = await factory.create<BankConnectionTransition>(
        'bank-connection-transition',
        {
          hasReceivedFirstPaycheck: false,
          toBankConnectionId: bankAccount.bankConnectionId,
        },
      );
      await factory.create('recurring-transaction', {
        bankAccountId: bankAccount.id,
        id: 1,
        userAmount,
        userId: bankConnection.userId,
        type: INCOME,
      });

      await detectFirstRecurringPaycheck({ recurringTransactionId: 1, type: INCOME });

      await bankConnectionTransition.reload();
    });

    after(() => clean(sandbox));

    it('should update the bank connection transition hasReceivedFirstPaycheck column', () => {
      expect(bankConnectionTransition.hasReceivedFirstPaycheck).to.equal(true);
    });

    it('should update the bank connection transition hasReceivedRecurringPaycheck column', () => {
      expect(bankConnectionTransition.hasReceivedRecurringPaycheck).to.equal(true);
    });
  });
});

async function expectErrorReason(
  promise: Promise<void>,
  reason: DetectFirstRecurringPaycheckErrorReason,
): Promise<DetectFirstRecurringPaycheckError> {
  try {
    await promise;
    throw new Error('Expected to throw DetectFirstRecurringPaycheckError');
  } catch (error) {
    if (error instanceof DetectFirstRecurringPaycheckError) {
      expect(error.reason).to.equal(reason);
      return error;
    }
    throw error;
  }
}
