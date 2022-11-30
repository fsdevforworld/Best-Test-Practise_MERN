import { moment } from '@dave-inc/time-lib';
import { AdvanceType } from '@dave-inc/wire-typings';
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
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

// unit test node outcomes
// confirm tree

describe('Income Validation Success Global Model V1', () => {
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
    }));
    sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox
      .stub(RecurringTransactionClient, 'getNextExpectedTransaction')
      .resolves({ expectedDate });
  });

  const APPROVE_AMOUNT = 100;
  const RUNNER_UP_AMT = 75;

  afterEach(() => clean(sandbox));

  [
    {
      testCase:
        'When passed income validation, model errors out, and passes all other static rules',
      expectedApproval: RUNNER_UP_AMT,
      bucketed: true,
      incomeValidationSuccessGlobalModelResponse: new Error('Model error'),
      previousAdvances: 0,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(RUNNER_UP_AMT),
        isExperimental: false,
      },
    },
    {
      testCase:
        'When passed income validation, score is below income validation global model threshold, and passes all other static rules',
      expectedApproval: RUNNER_UP_AMT,
      incomeValidationSuccessGlobalModelResponse: 0.001,
      previousAdvances: 0,
      expected: {
        approved: false,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(0),
        isExperimental: false,
      },
    },
    {
      testCase:
        'When passed income validation and score meets income validation global model threshold',
      expectedApproval: APPROVE_AMOUNT,
      incomeValidationSuccessGlobalModelResponse: 0.96,
      previousAdvances: 0,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(APPROVE_AMOUNT),
        isExperimental: false,
      },
    },
    {
      testCase: 'When passed income validation and has 10 advances',
      expectedApproval: RUNNER_UP_AMT,
      incomeValidationSuccessGlobalModelResponse: 0.853,
      previousAdvances: 10,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(RUNNER_UP_AMT),
        isExperimental: false,
      },
    },
    // testing for the full $100 amount
    {
      testCase: 'When passed income validation and has 10 advances',
      expectedApproval: APPROVE_AMOUNT,
      incomeValidationSuccessGlobalModelResponse: 0.898,
      previousAdvances: 10,
      expected: {
        approved: true,
        advanceType: AdvanceType.normalAdvance,
        approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(APPROVE_AMOUNT),
        isExperimental: false,
      },
    },
  ].forEach(
    ({
      testCase,
      expectedApproval,
      incomeValidationSuccessGlobalModelResponse,
      expected,
      previousAdvances,
    }) => {
      describe(testCase, () => {
        it(`should approve ${expectedApproval}`, async () => {
          const stub = stubUnderwritingML(sandbox, {
            modelType: UnderwritingModelType.GlobalModelRandomSample,
            error:
              incomeValidationSuccessGlobalModelResponse instanceof Error
                ? incomeValidationSuccessGlobalModelResponse
                : null,
            score:
              incomeValidationSuccessGlobalModelResponse instanceof Error
                ? null
                : incomeValidationSuccessGlobalModelResponse,
          });
          stub.onSecondCall().resolves({ score: 0 });
          for (let i = 1; i <= previousAdvances; i++) {
            await factory.create('advance', {
              userId: bankAccount.userId,
              bankAccountId: bankAccount.id,
              outstanding: 0,
              createdDate: moment()
                .subtract(i, 'days')
                .ymd(),
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
        });

        it('should use paycheck date as payback date', async () => {
          stubUnderwritingML(sandbox, {
            modelType: UnderwritingModelType.GlobalModelRandomSample,
            score: 0.96,
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
            })
            .expect(200);

          expect(body).to.deep.include({
            approved: true,
            advanceType: AdvanceType.normalAdvance,
            approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(APPROVE_AMOUNT),
            isExperimental: false,
            recurringTransactionId: recurringTransaction.id,
          });

          const advanceApproval = await AdvanceApproval.findOne({
            where: { id: body.id },
          });

          expect(advanceApproval.defaultPaybackDate.ymd()).to.eq(expectedDate);
        });

        it('should include users with single observation income', async () => {
          stubUnderwritingML(sandbox, {
            modelType: UnderwritingModelType.GlobalModelRandomSample,
            error:
              incomeValidationSuccessGlobalModelResponse instanceof Error
                ? incomeValidationSuccessGlobalModelResponse
                : null,
            score:
              incomeValidationSuccessGlobalModelResponse instanceof Error
                ? null
                : incomeValidationSuccessGlobalModelResponse,
          });

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
              advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
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
    },
  );
});
