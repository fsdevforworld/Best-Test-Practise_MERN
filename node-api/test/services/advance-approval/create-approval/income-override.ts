import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';

import { BankAccount, RecurringTransaction } from '../../../../src/models';

import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
} from '../../../test-helpers';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import { generateBankingDataSource } from '../../../../src/domain/banking-data-source';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';
import { moment } from '@dave-inc/time-lib';

describe('Income Override', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let recurringTransaction: RecurringTransaction;

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser());
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  it('should send a $75 advance response w/ all the required data for a user with an income override', async () => {
    const bankConnection = await bankAccount.getBankConnection();
    const bds = await generateBankingDataSource(bankConnection);

    sandbox.stub(bds, 'getBalance').resolves({
      externalId: bankAccount.externalId,
      available: 3,
      current: 3,
    });

    return request(app)
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
        expect(res.body[0].type).to.not.exist;
        expect(res.body[0].rejectionReasons[0]?.message).to.not.exist;
      });
  });
});
