import * as request from 'supertest';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import app, { GetPreQualifyPath } from '../../../src/services/advance-approval';
import { getApprovalBankAccount } from '../../../src/domain/advance-approval-request';
import factory from '../../factories';
import { clean, stubBankTransactionClient } from '../../test-helpers';
import { UserPreQualifyResponse } from '../../../src/services/advance-approval/types';
import { DaveBankingModelEligibilityNode } from '../../../src/services/advance-approval/advance-approval-engine/nodes';
import RecurringTransactionClient from '../../../src/services/advance-approval/recurring-transaction-client';

describe('Get Pre-Qualify', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => sandbox.restore());

  after(() => clean(sandbox));

  it('should get user pre-qualify check results', async () => {
    const bankAccount = await factory.create('bod-checking-account');
    const income = await factory.create('recurring-transaction', {
      userId: bankAccount.userId,
      bankAccountId: bankAccount.id,
      interval: RecurringTransactionInterval.BIWEEKLY,
      params: ['monday'],
      userAmount: 500,
    });
    sandbox.useFakeTimers(moment('2021-03-01').unix() * 1000);
    sandbox.stub(RecurringTransactionClient, 'getMatchingBankTransactions').resolves([
      {
        transactionDate: '2021-02-08',
        amount: 550,
      },
      {
        transactionDate: '2021-02-22',
        amount: 475,
      },
    ]);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([income]);

    const { body } = await request(app)
      .get(GetPreQualifyPath)
      .send({
        userId: bankAccount.userId,
        bankAccount: await getApprovalBankAccount(bankAccount),
      });

    const preQualifyChecks = body as UserPreQualifyResponse;
    expect(preQualifyChecks.isDaveBankingEligible).to.be.true;
    expect(preQualifyChecks.daveBankingIncomes).to.deep.equal([income.id]);
  });

  it('should not pre-qualify non-BoD bank account', async () => {
    const bankAccount = await factory.create('checking-account');
    const income = await factory.create('recurring-transaction', {
      userId: bankAccount.userId,
      bankAccountId: bankAccount.id,
      interval: RecurringTransactionInterval.BIWEEKLY,
      params: ['monday'],
      userAmount: 500,
    });
    sandbox.useFakeTimers(moment('2021-03-01').unix() * 1000);
    sandbox.stub(RecurringTransactionClient, 'getMatchingBankTransactions').resolves([
      {
        transactionDate: '2021-02-08',
        amount: 550,
      },
      {
        transactionDate: '2021-02-22',
        amount: 475,
      },
    ]);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([income]);

    const eligibilityStub = sandbox
      .stub(DaveBankingModelEligibilityNode, 'performIncomeCheck')
      .returns({});

    const { body } = await request(app)
      .get(GetPreQualifyPath)
      .send({
        userId: bankAccount.userId,
        bankAccount: await getApprovalBankAccount(bankAccount),
      });

    const preQualifyChecks = body as UserPreQualifyResponse;
    expect(eligibilityStub.notCalled).to.be.true;
    expect(preQualifyChecks.isDaveBankingEligible).to.be.false;
  });

  it('should not pre-qualify ineligible incomes', async () => {
    const bankAccount = await factory.create('bod-checking-account');
    const income = await factory.create('recurring-transaction', {
      userId: bankAccount.userId,
      bankAccountId: bankAccount.id,
      interval: RecurringTransactionInterval.BIWEEKLY,
      params: ['monday'],
      userAmount: 500,
    });
    sandbox.stub(RecurringTransactionClient, 'getMatchingBankTransactions').resolves([]);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([income]);

    const { body } = await request(app)
      .get(GetPreQualifyPath)
      .send({
        userId: bankAccount.userId,
        bankAccount: await getApprovalBankAccount(bankAccount),
      });

    const preQualifyChecks = body as UserPreQualifyResponse;
    expect(preQualifyChecks.isDaveBankingEligible).to.be.false;
  });
});
