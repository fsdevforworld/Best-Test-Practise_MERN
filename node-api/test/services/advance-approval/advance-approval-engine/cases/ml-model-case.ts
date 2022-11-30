import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';

import {
  AdvanceApprovalResult,
  ApprovalDict,
} from '../../../../../src/services/advance-approval/types';

import { UnderwritingModelType } from '../../../../../src/lib/oracle';

import {
  getModelCase,
  MlModelDisapprovedError,
  MlModelRequestError,
} from '../../../../../src/services/advance-approval/advance-approval-engine/cases/ml-model-case';
import { clean, stubUnderwritingML } from '../../../../test-helpers';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../../../../../src/services/advance-approval/advance-approval-engine/common';

describe('ML Model Case', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('getModelCase', () => {
    const REQUEST_ERROR = new Error('u BrOkE eVeRyThInG');

    [
      {
        testCase: 'should return ml-node-disapproved if result is under any score threshold',
        modelType: UnderwritingModelType.VariableTinyMoneyModel,
        scoreLimits: {
          25: 0.68,
          60: 0.96,
          75: 0.971,
        },
        mlResponse: { score: 0.67 },
        expected: {
          error: MlModelDisapprovedError,
          logData: {
            mlApprovedAmount: 0,
            mlDidRun: true,
            mlDidError: false,
            mlScore: 0.67,
            scoreLimits: {
              25: 0.68,
              60: 0.96,
              75: 0.971,
            },
          },
          updates: { approvedAmounts: [], mlDidError: false },
        },
      },
      {
        testCase: 'should return ml-errored if request errors out',
        modelType: UnderwritingModelType.GeneralizedFailureModelV2,
        scoreLimits: {
          25: 0.68,
          60: 0.96,
          75: 0.971,
        },
        mlResponse: { error: REQUEST_ERROR },
        expected: {
          error: MlModelRequestError,
          logData: {
            mlApprovedAmount: 0,
            mlDidRun: true,
            mlDidError: true,
            mlError: REQUEST_ERROR,
            scoreLimits: {
              25: 0.68,
              60: 0.96,
              75: 0.971,
            },
          },
          updates: { approvedAmounts: [], mlDidError: true },
        },
      },
      {
        testCase:
          'should return with the correctly updated approved amounts when score crosses a threshold',
        modelType: UnderwritingModelType.VariableTinyMoneyModel,
        scoreLimits: {
          25: 0.68,
          60: 0.96,
          75: 0.971,
        },
        mlResponse: { score: 0.69 },
        expected: {
          error: null,
          logData: {
            mlApprovedAmount: 25,
            mlDidRun: true,
            mlDidError: false,
            mlScore: 0.69,
            scoreLimits: {
              25: 0.68,
              60: 0.96,
              75: 0.971,
            },
          },
          updates: { approvedAmounts: APPROVED_AMOUNTS_BY_MAX_AMOUNT[25], mlDidError: false },
        },
      },
      {
        testCase:
          'should return with the correctly updated approved amounts when score crosses a threshold',
        modelType: UnderwritingModelType.VariableTinyMoneyModel,
        scoreLimits: {
          25: 0.68,
          60: 0.96,
          75: 0.971,
        },
        mlResponse: { score: 0.97 },
        expected: {
          error: null,
          logData: {
            mlApprovedAmount: 60,
            mlDidRun: true,
            mlDidError: false,
            mlScore: 0.97,
            scoreLimits: {
              25: 0.68,
              60: 0.96,
              75: 0.971,
            },
          },
          updates: { approvedAmounts: APPROVED_AMOUNTS_BY_MAX_AMOUNT[60], mlDidError: false },
        },
      },
      {
        testCase:
          'should return with the correctly updated approved amounts when score crosses a threshold',
        modelType: UnderwritingModelType.VariableTinyMoneyModel,
        scoreLimits: {
          25: 0.68,
          60: 0.96,
          75: 0.971,
        },
        mlResponse: { score: 0.972 },
        expected: {
          error: null,
          logData: {
            mlApprovedAmount: 75,
            mlDidRun: true,
            mlDidError: false,
            mlScore: 0.972,
            scoreLimits: {
              25: 0.68,
              60: 0.96,
              75: 0.971,
            },
          },
          updates: { approvedAmounts: APPROVED_AMOUNTS_BY_MAX_AMOUNT[75], mlDidError: false },
        },
      },
    ].forEach(({ testCase, modelType, scoreLimits, mlResponse, expected }) => {
      it(testCase, async () => {
        const modelCase = getModelCase('some-node', modelType, scoreLimits, {
          version: { major: 1, minor: 0 },
          timeout: 10000,
        });

        stubUnderwritingML(sandbox, mlResponse);

        const approvalDict = {
          userId: 123,
          bankAccount: { id: 456 },
        } as ApprovalDict;

        const approvalResponse = {
          defaultPaybackDate: moment(),
        } as AdvanceApprovalResult;

        const results = await modelCase(approvalDict, approvalResponse);

        expect(results).to.deep.eq(expected);
      });
    });
  });
});
