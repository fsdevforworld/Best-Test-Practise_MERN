import { AdvanceType } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';

import { AdvanceNodeLog, BankAccount } from '../../../../src/models';

import {
  getApprovedAmountsByMaximumApprovedAmount,
  NodeNames,
} from '../../../../src/services/advance-approval/advance-approval-engine/common';
import { UnderwritingModelType } from '../../../../src/lib/oracle';

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
import { moment } from '@dave-inc/time-lib';

describe('Income Validation Failure Global Model', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;

  beforeEach(async () => {
    stubBalanceLogClient(sandbox);
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount } = await buildIntegrationTestUser({
      failedIncomeValidation: true,
    }));
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  [
    {
      testCase: 'should approve nothing when failed income validation and model errors out',
      bucketed: true,
      incomeValidationFailureGlobalModelResponse: new Error('Model error'),
      expected: {
        approved: false,
        primaryRejectionReason: {
          type: 'missing-paycheck',
          message: 'Your bank doesn’t show any reliable income to advance from.',
        },
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve nothing when failed income validation and score is below income validation global model threshold',
      incomeValidationFailureGlobalModelResponse: 0.01,
      expected: {
        approved: false,
        primaryRejectionReason: {
          type: 'missing-paycheck',
          message: 'Your bank doesn’t show any reliable income to advance from.',
        },
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve 25 when failed income validation and score meets income validation global model threshold',
      incomeValidationFailureGlobalModelResponse: 0.956,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(25),
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve 30 when failed income validation and score meets income validation global model threshold',
      incomeValidationFailureGlobalModelResponse: 0.972,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(50),
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve 75 when failed income validation and score meets income validation model threshold',
      incomeValidationFailureGlobalModelResponse: 0.974,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(75),
        isExperimental: false,
      },
    },
    {
      testCase:
        'should approve 100 when failed income validation and score meets income validation model threshold',
      incomeValidationFailureGlobalModelResponse: 0.993,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(100),
        isExperimental: false,
      },
    },
  ].forEach(({ testCase, incomeValidationFailureGlobalModelResponse, expected }) => {
    it(testCase, async () => {
      const stub = stubUnderwritingML(sandbox, {
        modelType: UnderwritingModelType.VariableTinyMoneyModel,
        score: 100,
      });
      if (incomeValidationFailureGlobalModelResponse) {
        stubUnderwritingML(sandbox, {
          stub,
          modelType: UnderwritingModelType.GlobalModelRandomSample,
          error:
            incomeValidationFailureGlobalModelResponse instanceof Error
              ? incomeValidationFailureGlobalModelResponse
              : null,
          score:
            incomeValidationFailureGlobalModelResponse instanceof Error
              ? null
              : incomeValidationFailureGlobalModelResponse,
        });
      }

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
      expect(body).to.deep.include(expected);

      const nodeLog = await AdvanceNodeLog.findOne({
        where: {
          advanceApprovalId: body.id,
          name: NodeNames.IncomeValidationFailureGMV1,
        },
      });
      expect(nodeLog.approvalResponse.isExperimental).to.eq(false);
      expect(nodeLog.approvalResponse.isMl).to.eq(true);
    });
  });
});
