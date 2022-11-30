import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';

import { AdvanceApproval, BankAccount, RecurringTransaction } from '../../../../src/models';

import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
} from '../../../test-helpers';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import factory from '../../../factories';
import { moment } from '@dave-inc/time-lib';
import {
  clearBankTransactionStore,
  upsertBankTransactionForStubs,
} from '../../../test-helpers/stub-bank-transaction-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { ONE_HUNDRED_APPROVED_AMOUNTS } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Account Age Node', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let recurringTransaction: RecurringTransaction;
  let getAccountStub: sinon.SinonStub;

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser());
    getAccountStub = sandbox
      .stub(HeathClient, 'getBankAccount')
      .returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  it('should bypass account age for bod account', async () => {
    const connection = await bankAccount.getBankConnection();
    await connection.update({ bankingDataSource: BankingDataSource.BankOfDave });
    getAccountStub.returns(getApprovalBankAccount(bankAccount));
    await clearBankTransactionStore();
    await upsertBankTransactionForStubs(
      await factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        displayName: recurringTransaction.transactionDisplayName,
        amount: recurringTransaction.userAmount,
        transactionDate: moment().subtract(1, 'day'),
      }),
    );
    stubUnderwritingML(sandbox, { score: 0.99 });

    await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone: 'America/New_York',
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      })
      .expect(200)
      .then(res => {
        expect(res.body[0].approved).to.equal(true);
        expect(res.body[0].approvedAmounts).to.deep.equal(ONE_HUNDRED_APPROVED_AMOUNTS);
      });

    const approvals = await AdvanceApproval.findAll({
      where: { userId: bankAccount.userId },
    });
    expect(approvals.length).to.eq(1);
    expect(approvals[0].bankAccountId).to.eq(bankAccount.id);
  });
});
