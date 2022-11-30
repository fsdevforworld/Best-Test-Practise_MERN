import { expect } from 'chai';
import * as moment from 'moment';
import * as request from 'supertest';
import * as sinon from 'sinon';

import { AdvanceExperimentLog, AdvanceNodeLog, BankAccount } from '../../../../src/models';

import {
  getApprovedAmountsByMaximumApprovedAmount,
  NodeNames,
  SOLVENCY_AMOUNT,
} from '../../../../src/services/advance-approval/advance-approval-engine/common';
import { ExperimentId } from '../../../../src/services/advance-approval/advance-approval-engine/experiments';
import { incomeValidationSingleObservationExperimentGate } from '../../../../src/services/advance-approval/advance-approval-engine/experiments/experiment-gates';

import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogBetweenDates,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
} from '../../../test-helpers';

import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { RecurringTransactionStatus } from '@dave-inc/wire-typings';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Income Validation Single Observation Experiment', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubPredictedPaybackML(sandbox);
    stubLoomisClient(sandbox);
    stubUnderwritingML(sandbox, { error: new Error('No thanks') });
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
  });

  afterEach(() => clean(sandbox));

  context('bucketed to experiment', () => {
    [
      {
        testCase: `bucketed - should reject if has valid single observed income but timing is off`,
        recurringTransactionStatus: RecurringTransactionStatus.SINGLE_OBSERVATION,
        failsIncomeTiming: true,
        failsLowIncome: false,
        solvencyValue: SOLVENCY_AMOUNT,
        expected: {
          approved: false,
          isExperimental: true,
        },
      },
      {
        testCase: `bucketed  - should approve big money if has valid single observed income and passes solvency`,
        recurringTransactionStatus: RecurringTransactionStatus.SINGLE_OBSERVATION,
        failsIncomeTiming: false,
        failsLowIncome: false,
        solvencyValue: SOLVENCY_AMOUNT,
        expected: {
          approved: true,
          approvedAmounts: getApprovedAmountsByMaximumApprovedAmount(75),
          isExperimental: true,
        },
      },
    ].forEach(
      ({
        testCase,
        recurringTransactionStatus,
        failsIncomeTiming,
        failsLowIncome,
        solvencyValue,
        expected,
      }) => {
        it(testCase, async () => {
          const userTimezone = 'America/New_York';
          const { bankAccount, recurringTransaction } = await buildIntegrationTestUser({
            hasLowIncome: failsLowIncome,
          });

          sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);

          sandbox.stub(HeathClient, 'getBankAccount').returns(getApprovalBankAccount(bankAccount));
          if (failsIncomeTiming) {
            sandbox
              .stub(RecurringTransactionClient, 'getNextExpectedTransaction')
              .resolves({ expectedDate: moment().tz(userTimezone) });
          } else {
            sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
              expectedDate: moment()
                .tz(userTimezone)
                .add(3, 'days'),
            });
          }

          await recurringTransaction.update({ status: recurringTransactionStatus });
          stubBalanceLogBetweenDates(
            bankAccount,
            moment().subtract(40, 'days'),
            moment().add(1, 'day'),
            solvencyValue,
          );

          sandbox
            .stub(incomeValidationSingleObservationExperimentGate, 'isEligibleForExperiment')
            .returns(true);

          const {
            body: [body],
          } = await request(app)
            .post(CreateApprovalPath)
            .send({
              bankAccountId: bankAccount.id,
              advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
              userTimezone,
              userId: bankAccount.userId,
              trigger: AdvanceApprovalTrigger.UserTerms,
              auditLog: true,
            })
            .expect(200);

          expect(body).to.deep.include(expected);

          const advanceNodeLogs = await AdvanceNodeLog.findAll({
            where: {
              advanceApprovalId: body.id,
              name: NodeNames.IncomeValidationNodeV2,
            },
          });

          expect(advanceNodeLogs).to.have.length(1);
          expect(advanceNodeLogs[0].success).to.be.true;

          const experimentLogs = await AdvanceExperimentLog.findAll({
            where: {
              advanceApprovalId: body.id,
              advanceExperimentId: ExperimentId.IncomeValidationSingleObservationExperiment,
            },
          });

          expect(experimentLogs).to.have.length(1);
          expect(experimentLogs[0].success).to.eq(expected.isExperimental);
        });
      },
    );
  });
});
