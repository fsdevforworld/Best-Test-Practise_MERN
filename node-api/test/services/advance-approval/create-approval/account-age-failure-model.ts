import { AdvanceType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { BankAccount, RecurringTransaction } from '../../../../src/models';
import { getApprovedAmountsByMaximumApprovedAmount } from '../../../../src/services/advance-approval/advance-approval-engine/common';
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
import { UnderwritingModelType } from '../../../../src/lib/oracle';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import * as BankingDataSync from '../../../../src/domain/banking-data-sync';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';
import { moment } from '@dave-inc/time-lib';

describe('Account Age Failure Experiments', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let recurringTransaction: RecurringTransaction;

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    sandbox.stub(BankingDataSync, 'fetchAndSyncBankTransactions').resolves();
    ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      isNewAccount: true,
    }));
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(30);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  [
    {
      testCase: 'should not approve anything if model errors out',
      response: new Error('Oopsies'),
      expected: {
        approved: false,
        isExperimental: false,
      },
    },
    {
      testCase: 'should not approve anything if score is below threshold',
      response: 0.8,
      expected: {
        approved: false,
        isExperimental: false,
      },
    },
    {
      testCase: 'should approve $75',
      response: 0.995,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(75),
        isExperimental: false,
      },
    },
  ].forEach(({ testCase, response, expected }) => {
    it(testCase, async () => {
      const modelStub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.GlobalModelRandomSample,
        error: response instanceof Error ? response : null,
        score: response instanceof Error ? null : response,
      });

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

      expect(body).to.deep.include(expected);

      sinon.assert.calledOnce(modelStub);
    });
  });
});
