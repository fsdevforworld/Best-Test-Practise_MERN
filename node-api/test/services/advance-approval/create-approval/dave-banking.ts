import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as moment from 'moment';
import * as request from 'supertest';
import * as sinon from 'sinon';

import { AdvanceNodeLog, BankAccount, BankConnection } from '../../../../src/models';

import {
  getApprovedAmountsByMaximumApprovedAmount,
  NodeNames,
} from '../../../../src/services/advance-approval/advance-approval-engine/common';

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
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Dave Banking', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubPredictedPaybackML(sandbox);
    stubUnderwritingML(sandbox, { error: new Error('No thanks') });
    stubLoomisClient(sandbox);
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  it('should fail eligibility and approve no money if there is no valid income', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      failedIncomeValidation: true,
    });
    await BankConnection.update(
      { bankingDataSource: BankingDataSource.BankOfDave },
      { where: { id: bankAccount.bankConnectionId } },
    );
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    const stub = sandbox
      .stub(RecurringTransactionClient, 'getIncomes')
      .resolves([recurringTransaction]);
    stub.onSecondCall().resolves([]);

    const {
      body: [body],
    } = await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        userTimezone: 'America/New_York',
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      })
      .expect(200);

    expect(body).to.deep.include({
      approved: false,
      primaryRejectionReason: {
        type: 'dave-banking-no-income',
        message: 'You must have a valid income greater than $200.',
      },
    });

    const advanceNodeLogs = await AdvanceNodeLog.findAll({
      where: { advanceApprovalId: body.id },
    });

    expect(advanceNodeLogs).to.have.length(1);
    expect(advanceNodeLogs[0].name).to.eq(NodeNames.EligibilityNode);
    expect(advanceNodeLogs[0].success).to.be.false;
  });

  it('should fail if income was missed', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser();
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);

    await Promise.all([
      BankConnection.update(
        { bankingDataSource: BankingDataSource.BankOfDave },
        { where: { id: bankAccount.bankConnectionId } },
      ),
      recurringTransaction.update({ missed: moment() }),
    ]);

    const {
      body: [body],
    } = await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone: 'America/New_York',
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      })
      .expect(200);

    expect(body).to.deep.include({
      approved: false,
    });
  });

  it('should approve $75 when pass all static rules', async () => {
    const { bankAccount, recurringTransaction } = await buildIntegrationTestUser();
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);

    await BankConnection.update(
      { bankingDataSource: BankingDataSource.BankOfDave },
      { where: { id: bankAccount.bankConnectionId } },
    );

    const {
      body: [body],
    } = await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone: 'America/New_York',
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      });

    expect(body).to.deep.include({
      approved: true,
      approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(75),
    });
  });
});
