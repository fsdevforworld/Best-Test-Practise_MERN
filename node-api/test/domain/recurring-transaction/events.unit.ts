import * as sinon from 'sinon';
import { expect } from 'chai';
import AdvanceApprovalClient from '../../../src/lib/advance-approval-client';
import { TransactionType } from '../../../src/typings';
import * as AdvanceApprovalRequest from '../../../src/domain/advance-approval-request';
import { newRecurringTransactionEvent } from '../../../src/domain/event';
import { RecurringTransaction } from '../../../src/domain/recurring-transaction';
import { publishNewRecurringTransaction } from '../../../src/domain/recurring-transaction/events';
import * as Utils from '../../../src/domain/recurring-transaction/utils';

describe('RecurringTransactionDomain/events', () => {
  const sandbox = sinon.createSandbox();

  describe('newRecurringTransaction event', () => {
    let publishStub: sinon.SinonStub;
    let preQualifyStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox.stub(Utils, 'getBankAccount').resolves({});
      sandbox.stub(AdvanceApprovalRequest, 'getApprovalBankAccount').resolves({});
      publishStub = sandbox.stub(newRecurringTransactionEvent, 'publish').resolves(null);
      preQualifyStub = sandbox.stub(AdvanceApprovalClient, 'preQualifyUser');
    });

    afterEach(() => sandbox.restore());

    it('should publish new recurring transaction event', async () => {
      const newRT = {
        transaction: {
          id: 10,
          userId: 999,
          bankAccountId: 99999,
          userAmount: 500,
          type: TransactionType.INCOME,
        } as RecurringTransaction,
        institutionId: 1000,
        minAmount: 10,
      };

      preQualifyStub.resolves({});

      await publishNewRecurringTransaction(newRT);

      sinon.assert.calledOnce(publishStub);
      const [publishArg] = publishStub.firstCall.args;
      expect(publishArg.recurringTransactionId).to.equal(newRT.transaction.id);
      expect(publishArg.userId).to.equal(newRT.transaction.userId);
      expect(publishArg.bankAccountId).to.equal(newRT.transaction.bankAccountId);
      expect(publishArg.type).to.equal(newRT.transaction.type);
      expect(publishArg.averageAmount).to.equal(newRT.transaction.userAmount);
      expect(publishArg.minimumAmount).to.equal(newRT.minAmount);
      expect(publishArg.institutionId).to.equal(newRT.institutionId);
      expect(publishArg.isDaveBankingDDEligible).to.not.be.true;
    });

    it('should publish new recurring transaction event with Dave Banking DD pre-qualified', async () => {
      const newRT = {
        transaction: {
          id: 10,
          userId: 999,
          bankAccountId: 99999,
          userAmount: 500,
          type: TransactionType.INCOME,
        } as RecurringTransaction,
        institutionId: 1000,
        minAmount: 10,
      };

      preQualifyStub.resolves({
        isDaveBankingEligible: true,
        daveBankingIncomes: [10, 12],
      });

      await publishNewRecurringTransaction(newRT);

      sinon.assert.calledOnce(publishStub);
      const [publishArg] = publishStub.firstCall.args;
      expect(publishArg.recurringTransactionId).to.equal(newRT.transaction.id);
      expect(publishArg.userId).to.equal(newRT.transaction.userId);
      expect(publishArg.bankAccountId).to.equal(newRT.transaction.bankAccountId);
      expect(publishArg.type).to.equal(newRT.transaction.type);
      expect(publishArg.averageAmount).to.equal(newRT.transaction.userAmount);
      expect(publishArg.minimumAmount).to.equal(newRT.minAmount);
      expect(publishArg.institutionId).to.equal(newRT.institutionId);
      expect(publishArg.isDaveBankingDDEligible).to.be.true;
    });

    it('should publish new recurring transaction without Dave Banking flag if account is eligible but not because of new income', async () => {
      const newRT = {
        transaction: {
          id: 10,
          userId: 999,
          bankAccountId: 99999,
          userAmount: 500,
          type: TransactionType.INCOME,
        } as RecurringTransaction,
        institutionId: 1000,
        minAmount: 10,
      };

      preQualifyStub.resolves({
        isDaveBankingEligible: true,
        daveBankingIncomes: [12],
      });

      await publishNewRecurringTransaction(newRT);

      sinon.assert.calledOnce(publishStub);
      const [publishArg] = publishStub.firstCall.args;
      expect(publishArg.recurringTransactionId).to.equal(newRT.transaction.id);
      expect(publishArg.userId).to.equal(newRT.transaction.userId);
      expect(publishArg.bankAccountId).to.equal(newRT.transaction.bankAccountId);
      expect(publishArg.type).to.equal(newRT.transaction.type);
      expect(publishArg.averageAmount).to.equal(newRT.transaction.userAmount);
      expect(publishArg.minimumAmount).to.equal(newRT.minAmount);
      expect(publishArg.institutionId).to.equal(newRT.institutionId);
      expect(publishArg.isDaveBankingDDEligible).to.not.be.true;
    });

    it('should not run pre-qualify check for new recurring expenses', async () => {
      const newRT = {
        transaction: {
          id: 10,
          userId: 999,
          bankAccountId: 99999,
          userAmount: -100,
          type: TransactionType.EXPENSE,
        } as RecurringTransaction,
        institutionId: 1000,
        minAmount: -100,
      };

      await publishNewRecurringTransaction(newRT);
      sinon.assert.notCalled(preQualifyStub);
    });
  });
});
