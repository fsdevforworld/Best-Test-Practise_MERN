import * as devSeed from '../../../../bin/dev-seed';
import { AdvanceApproval, BankAccount } from '../../../../src/models';
import * as request from 'supertest';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
} from '../../../test-helpers';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Test solvency', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    await devSeed.main('up', ['donation-organization', 'payday-solvency']);
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
  });

  afterEach(() => clean(sandbox));

  it('fail both normal advance and micro advance', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasPreviousAdvance: false,
      failedSolvency: true,
    });
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'day')
        .ymd(),
    });
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
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
        expect(res.body[0].approved).to.equal(false);
        expect(res.body[0].primaryRejectionReason.type).to.exist;
        expect(res.body[0].primaryRejectionReason.message).to.exist;
      });
    const log = await AdvanceApproval.findOne({ where: { userId: bankAccount.userId } });
    expect(log.approved).to.equal(false);
    expect(log.normalAdvanceApproved).to.equal(false);
    expect(log.microAdvanceApproved).to.equal(false);
  });

  it('pass with solvency on paycheck date', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasPreviousAdvance: false,
    });
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'day')
        .ymd(),
    });
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    const approvedAmounts = APPROVED_AMOUNTS_BY_MAX_AMOUNT[75];
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
        expect(res.body[0].advanceType).to.equal('NORMAL_ADVANCE');
        expect(res.body[0].approvedAmounts).to.deep.equal(approvedAmounts);
      });
    const log = await AdvanceApproval.findOne({ where: { userId: bankAccount.userId } });
    expect(log.approved).to.equal(true);
    expect(log.normalAdvanceApproved).to.equal(true);
    expect(log.microAdvanceApproved).to.equal(false);
  });

  it('pass with solvency on day after paycheck date', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasPreviousAdvance: false,
    });
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'day')
        .ymd(),
    });
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    const approvedAmounts = APPROVED_AMOUNTS_BY_MAX_AMOUNT[75];
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
        expect(res.body[0].advanceType).to.equal('NORMAL_ADVANCE');
        expect(res.body[0].approvedAmounts).to.deep.equal(approvedAmounts);
      });
    const log = await AdvanceApproval.findOne({ where: { userId: bankAccount.userId } });
    expect(log.approved).to.equal(true);
    expect(log.normalAdvanceApproved).to.equal(true);
    expect(log.microAdvanceApproved).to.equal(false);
  });
});
