import { expect } from 'chai';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import {
  buildApprovalDict,
  getRecurringTransactionsEligibleForAdvance,
  requestAdvances,
  serializeApprovalResponse,
} from '../../../../src/services/advance-approval/advance-approval-engine';
import { AdminPaycheckOverride, AdvanceApproval, BankAccount, User } from '../../../../src/models';
import { RecurringTransactionStatus } from '@dave-inc/wire-typings';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import { moment } from '@dave-inc/time-lib';
import factory from '../../../factories';
import * as Bluebird from 'bluebird';
import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubLoomisClient,
} from '../../../test-helpers';
import stubBankTransactionClient from '../../../test-helpers/stub-bank-transaction-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient, {
  RecurringTransaction,
} from '../../../../src/services/advance-approval/recurring-transaction-client';
import * as DataEngine from '../../../../src/services/advance-approval/data-engine';

describe('AdvanceApprovalEngine', () => {
  const sandbox = sinon.createSandbox();

  let getNextExpectedPaycheckForAccountStub: SinonStub;
  let dataEngineStub: SinonStub;

  beforeEach(() => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    getNextExpectedPaycheckForAccountStub = sandbox
      .stub(RecurringTransactionClient, 'getNextExpectedTransaction')
      .resolves({
        expectedDate: moment()
          .add(4, 'day')
          .ymd(),
      });

    dataEngineStub = sandbox.stub(DataEngine, 'publishApprovalEvents');
  });
  afterEach(() => clean(sandbox));

  describe('buildApprovalDict', () => {
    let bankAccount: BankAccount;
    let user: User;
    let getNextPaycheckOverrideForAccountStub: SinonStub;
    let getBankConnectionStub: SinonStub;

    beforeEach(async () => {
      bankAccount = await factory.create('bank-account');
      user = await bankAccount.getUser();
      getNextPaycheckOverrideForAccountStub = sandbox
        .stub(AdminPaycheckOverride, 'getNextPaycheckOverrideForAccount')
        .resolves({});
    });

    it('should throw an exception if a bank connection is not found', async () => {
      sandbox.stub(bankAccount, 'getBankConnection').resolves(null);
      return getApprovalBankAccount(bankAccount).should.be.rejectedWith(
        Error,
        'Bank connection not found',
      );
    });

    context('when a valid bank connection is present', () => {
      beforeEach(() => {
        getBankConnectionStub = sandbox.stub(bankAccount, 'getBankConnection').resolves({
          isDaveBanking: () => false,
        });
      });

      it('should return a single approval response for a single recurringTransaction', async () => {
        const recurringTransactions = await Promise.all([
          factory.create('recurring-transaction', {
            bankAccountId: bankAccount.id,
            userId: user.id,
          }),
        ]);
        const results = await Bluebird.map(
          recurringTransactions,
          async (recurTrans: RecurringTransaction) => {
            sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves(recurringTransactions);
            return buildApprovalDict(
              bankAccount.userId,
              await getApprovalBankAccount(bankAccount),
              { totalAdvancesTaken: 10, outstandingAdvance: null },
              recurTrans,
              AdvanceApprovalTrigger.UserTerms,
              'America/New_York',
              { auditLog: true },
            );
          },
        );
        expect(results.length).to.equal(1);
        expect(getNextPaycheckOverrideForAccountStub.callCount).to.equal(1);
        expect(getBankConnectionStub.callCount).to.equal(1);
        expect(getNextExpectedPaycheckForAccountStub.callCount).to.equal(1);
      });

      it('should return two approval responses for two recurringTransactions', async () => {
        const recurringTransactions = await Promise.all([
          factory.create<RecurringTransaction>('recurring-transaction', {
            bankAccountId: bankAccount.id,
            userId: user.id,
          }),
          factory.create<RecurringTransaction>('recurring-transaction', {
            bankAccountId: bankAccount.id,
            userId: user.id,
          }),
        ]);
        sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves(recurringTransactions);

        const results = await Bluebird.mapSeries(recurringTransactions, async recurTrans => {
          return buildApprovalDict(
            bankAccount.userId,
            await getApprovalBankAccount(bankAccount),
            { totalAdvancesTaken: 10, outstandingAdvance: null },
            recurTrans,
            AdvanceApprovalTrigger.UserTerms,
            'America/New_York',
            { auditLog: true },
          );
        });
        expect(results.length).to.equal(2);
        expect(getNextPaycheckOverrideForAccountStub.callCount).to.equal(2);
        expect(getBankConnectionStub.callCount).to.equal(2);
        expect(getNextExpectedPaycheckForAccountStub.callCount).to.equal(2);
      });
    });
  });

  describe('requestAdvances', () => {
    it('should sort with priority to the highest approval', async () => {
      const {
        user,
        bankAccount,
        recurringTransaction: recurringTransactionA,
      } = await buildIntegrationTestUser({ hasLowIncome: true });
      const { recurringTransaction: recurringTransactionB } = await buildIntegrationTestUser({
        user,
        bankAccount,
      });

      sandbox
        .stub(RecurringTransactionClient, 'getIncomes')
        .resolves([recurringTransactionA, recurringTransactionB]);

      await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionA.id });

      const approvals = await requestAdvances(
        user.id,
        [await getApprovalBankAccount(bankAccount)],
        { totalAdvancesTaken: 10, outstandingAdvance: null },
        AdvanceApprovalTrigger.UserTerms,
        'America/New_York',
        {
          auditLog: true,
        },
      );

      expect(approvals[0].recurringTransactionId).to.eq(recurringTransactionB.id);
    });

    it("should sort with priority to the approval associated with the bank account's main paycheck when there is a tie", async () => {
      const {
        user,
        bankAccount,
        recurringTransaction: recurringTransactionA,
      } = await buildIntegrationTestUser();
      const { recurringTransaction: recurringTransactionB } = await buildIntegrationTestUser({
        user,
        bankAccount,
      });

      sandbox
        .stub(RecurringTransactionClient, 'getIncomes')
        .resolves([recurringTransactionA, recurringTransactionB]);

      await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionB.id });

      const approvals = await requestAdvances(
        user.id,
        [await getApprovalBankAccount(bankAccount)],
        { totalAdvancesTaken: 10, outstandingAdvance: null },
        AdvanceApprovalTrigger.UserTerms,
        'America/New_York',
        {
          auditLog: true,
        },
      );

      expect(approvals).to.have.length(2);
      expect(approvals[0].approvedAmounts).to.deep.eq(approvals[1].approvedAmounts);
      expect(approvals[0].recurringTransactionId).to.eq(recurringTransactionB.id);
      expect(approvals[1].recurringTransactionId).to.eq(recurringTransactionA.id);

      const [approvalA, approvalB] = await Promise.all([
        AdvanceApproval.findOne({ where: { id: approvals[0].id } }),
        AdvanceApproval.findOne({ where: { id: approvals[1].id } }),
      ]);

      expect(approvalA.isPreferred).to.be.true;
      expect(approvalA.recurringTransactionId).to.eq(recurringTransactionB.id);
      expect(approvalB.isPreferred).to.be.false;
      expect(approvalB.recurringTransactionId).to.eq(recurringTransactionA.id);
    });

    it.skip("should return the approval associated with the bank account's main paycheck first when all are rejected", async () => {
      const {
        user,
        bankAccount,
        recurringTransaction: recurringTransactionA,
      } = await buildIntegrationTestUser();
      const { recurringTransaction: recurringTransactionB } = await buildIntegrationTestUser({
        user,
        bankAccount,
      });

      sandbox
        .stub(RecurringTransactionClient, 'getIncomes')
        .resolves([recurringTransactionA, recurringTransactionB]);

      getNextExpectedPaycheckForAccountStub.resolves({ expectedDate: moment().ymd() });

      await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionB.id });

      const approvals = await requestAdvances(
        user.id,
        [await getApprovalBankAccount(bankAccount)],
        { totalAdvancesTaken: 10, outstandingAdvance: null },
        AdvanceApprovalTrigger.UserTerms,
        'America/New_York',
        {
          auditLog: true,
        },
      );

      expect(approvals[0].approved).to.be.false;
      expect(approvals[0].recurringTransactionId).to.eq(recurringTransactionB.id);

      const approval = await AdvanceApproval.findOne({
        where: { id: approvals[0].id },
      });

      expect(approval.isPreferred).to.be.true;
      expect(approval.recurringTransactionId).to.eq(recurringTransactionB.id);
    });

    it('publishes events to data engine', async () => {
      const {
        user,
        bankAccount,
        recurringTransaction: recurringTransactionA,
      } = await buildIntegrationTestUser({ hasLowIncome: true });

      sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransactionA]);

      await bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransactionA.id });

      const approvals = await requestAdvances(
        user.id,
        [await getApprovalBankAccount(bankAccount)],
        { totalAdvancesTaken: 10, outstandingAdvance: null },
        AdvanceApprovalTrigger.UserTerms,
        'America/New_York',
        {
          auditLog: true,
        },
      );

      sinon.assert.calledOnce(dataEngineStub);
      sinon.assert.calledWithExactly(dataEngineStub, user.id, approvals);
    });
  });

  describe('getRecurringTransactionsEligibleForAdvance', () => {
    it('should return recurring transactions that are income and have valid statuses', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');

      const expectedEligibleRecurringTransactions = await Promise.all([
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 15,
          status: RecurringTransactionStatus.VALID,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 500,
          status: RecurringTransactionStatus.VALID,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 300,
          status: RecurringTransactionStatus.INVALID_NAME,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 400,
          status: RecurringTransactionStatus.SINGLE_OBSERVATION,
        }),
      ]);

      sandbox
        .stub(RecurringTransactionClient, 'getIncomes')
        .resolves(expectedEligibleRecurringTransactions);

      // In-eligible
      await Promise.all([
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 0,
          status: RecurringTransactionStatus.VALID,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 0,
          status: RecurringTransactionStatus.SINGLE_OBSERVATION,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 300,
          status: RecurringTransactionStatus.NOT_VALIDATED,
        }),
        factory.create<RecurringTransaction>('recurring-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          userAmount: 400,
          status: RecurringTransactionStatus.MISSED,
        }),
      ]);

      const eligibleRecurringTransactions = await getRecurringTransactionsEligibleForAdvance(
        bankAccount.userId,
        bankAccount.id,
      );

      const formatted = (recurringTransaction: RecurringTransaction) => ({
        id: recurringTransaction.id,
        bankAccountId: recurringTransaction.bankAccountId,
        userId: recurringTransaction.userId,
        userAmount: recurringTransaction.userAmount,
        status: recurringTransaction.status,
      });

      expect(eligibleRecurringTransactions.map(formatted)).to.have.deep.members(
        expectedEligibleRecurringTransactions.map(formatted),
      );
    });
  });

  describe('serializeApprovalResponse', () => {
    it('should keep approved amounts if bod and not $75', async () => {
      const bankConnection = await factory.create('bank-of-dave-bank-connection');
      const approvedAmounts = [5, 10, 20];
      const result = serializeApprovalResponse(
        { approvedAmounts } as any,
        { bankConnection } as any,
      );

      expect(result.approvedAmounts).to.deep.eq(approvedAmounts);
    });
  });
});
