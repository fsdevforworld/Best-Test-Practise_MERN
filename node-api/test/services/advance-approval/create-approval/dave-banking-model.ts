import { moment } from '@dave-inc/time-lib';
import { AdvanceType } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';

import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { getApprovedAmountsByMaximumApprovedAmount } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import { incomeValidationSingleObservationExperimentGate } from '../../../../src/services/advance-approval/advance-approval-engine/experiments/experiment-gates';
import { UnderwritingModelType } from '../../../../src/lib/oracle';
import { AdvanceApproval, BankAccount, RecurringTransaction } from '../../../../src/models';
import { RecurringTransactionStatus } from '../../../../src/typings';
import factory from '../../../factories';
import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
} from '../../../test-helpers';
import { clearBankTransactionStore } from '../../../test-helpers/stub-bank-transaction-client';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Dave Banking Global Model', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  let bankAccount: BankAccount;
  let recurringTransaction: RecurringTransaction;
  const expectedDate = moment()
    .add(3, 'day')
    .ymd();

  beforeEach(async () => {
    stubBalanceLogClient(sandbox);
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser({
      hasPreviousAdvance: false,
      isBodBankAccount: true,
    }));
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    await clearBankTransactionStore();

    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox
      .stub(RecurringTransactionClient, 'getNextExpectedTransaction')
      .resolves({ expectedDate });
  });

  afterEach(() => clean(sandbox));

  async function setup({
    incomeAmount,
    globalModelResponse,
  }: {
    incomeAmount: number;
    globalModelResponse: any;
  }) {
    const date0 = moment().subtract(1, 'day');
    const date1 = date0.clone().subtract(1, 'month');

    await Bluebird.map([date0, date1], transactionDate => {
      return factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: recurringTransaction.transactionDisplayName,
        amount: incomeAmount,
        transactionDate,
      });
    });

    const stub = stubUnderwritingML(sandbox, {
      modelType: UnderwritingModelType.GlobalModelRandomSample,
      error: globalModelResponse instanceof Error ? globalModelResponse : null,
      score: globalModelResponse instanceof Error ? null : globalModelResponse,
    });
    stub.onSecondCall().resolves({ score: 0 });
  }

  [
    {
      testCase:
        'should approve 75 when passed income validation, model errors out, and passes all other static rules',
      globalModelResponse: new Error('Model error'),
      previousAdvances: 0,
      incomeAmount: 1000,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(75),
        isExperimental: false,
      },
    },
    {
      testCase:
        'should fail when passed income validation, score is below income validation global model threshold',
      globalModelResponse: 0.6,
      previousAdvances: 0,
      incomeAmount: 1000,
      expected: {
        approved: false,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: [],
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve 200 when passed income validation and score meets income validation global model threshold',
      globalModelResponse: 0.71,
      previousAdvances: 0,
      incomeAmount: 1000,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(200),
        isExperimental: false,
      },
    },
    {
      testCase: 'should approve 200 when passed income validation and has 10 advances',
      globalModelResponse: 0.94,
      previousAdvances: 10,
      incomeAmount: 1000,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(200),
        isExperimental: false,
      },
    },
    {
      testCase: 'should approve 100 when passed income validation and income is too low',
      globalModelResponse: 0.99,
      previousAdvances: 10,
      incomeAmount: 200,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(100),
        isExperimental: false,
      },
    },
  ].forEach(({ testCase, globalModelResponse, expected, previousAdvances, incomeAmount }) => {
    it(testCase, async () => {
      await setup({ incomeAmount, globalModelResponse });
      const {
        body: [body],
      } = await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: previousAdvances, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200);

      expect(body).to.deep.include(expected);
    });

    it(`should use paycheck date as payback date ${testCase}`, async () => {
      await setup({ incomeAmount, globalModelResponse });

      const {
        body: [body],
      } = await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: previousAdvances, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200);

      expect(body).to.deep.include({
        ...expected,
        recurringTransactionId: recurringTransaction.id,
      });

      const advanceApproval = await AdvanceApproval.findOne({
        where: { id: body.id },
      });

      expect(advanceApproval.defaultPaybackDate.ymd()).to.eq(expectedDate);
    });

    it(`should include users with single observation income ${testCase}`, async () => {
      await setup({ incomeAmount, globalModelResponse });

      sandbox
        .stub(incomeValidationSingleObservationExperimentGate, 'isEligibleForExperiment')
        .resolves(true);

      await recurringTransaction.update({
        status: RecurringTransactionStatus.SINGLE_OBSERVATION,
      });

      const {
        body: [body],
      } = await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: previousAdvances, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200);

      expect(body).to.deep.include({
        ...expected,
        isExperimental: true,
      });
    });
  });
});
