import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCase,
  DecisionCaseError,
  UnderwritingScoreLimits,
} from '../../types';
import * as MachineLearningDomain from '../../machine-learning';
import { isFunction, isNil, reduce } from 'lodash';
import logger from '../../../../lib/logger';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { IOracleConfig, UnderwritingModelType } from '../../../../lib/oracle';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../common';
import { getDecisionCaseError } from '../decision-node';

export const MlModelDisapprovedError = getDecisionCaseError(
  'ml-model-disapproved',
  'Machine Learning node did not pass',
);

export const MlModelRequestError = getDecisionCaseError(
  'ml-errored',
  'Machine Learning request errored out',
);

export const MlDisabledError = getDecisionCaseError(
  'ml-disabled',
  'Machine Learning disabled via configuration',
);

export type ScoreLimitGenerator = (dict: ApprovalDict) => UnderwritingScoreLimits;

export function getModelCase(
  nodeName: string,
  modelType: UnderwritingModelType,
  scoreLimits: ScoreLimitGenerator | UnderwritingScoreLimits,
  oracleConfig: IOracleConfig,
): DecisionCase<AdvanceApprovalResult> {
  // This is a named function instead of anonymous since the function name is saved in the advance_rule_log table
  if (!MachineLearningDomain.isMLEnabled()) {
    return async function modelDisabledCase() {
      logger.warn('ML is disabled for underwriting');
      return {
        updates: {
          mlDidError: true,
        },
        error: MlDisabledError,
      };
    };
  } else {
    return async function modelCase(
      approvalDict: ApprovalDict,
      previousResult: AdvanceApprovalResult,
    ) {
      const staticScoreLimits = isFunction(scoreLimits) ? scoreLimits(approvalDict) : scoreLimits;
      const result = await getMlResult({
        nodeName,
        approvalDict,
        approvalResponse: previousResult,
        modelType,
        scoreLimits: staticScoreLimits,
        oracleConfig,
      });
      const approvedAmounts = APPROVED_AMOUNTS_BY_MAX_AMOUNT[result.mlApprovedAmount];

      let error: DecisionCaseError = null;
      if (result.mlDidError) {
        error = MlModelRequestError;
      } else if (result.mlApprovedAmount === 0) {
        error = MlModelDisapprovedError;
      }

      return {
        logData: {
          ...result,
          scoreLimits: staticScoreLimits,
        },
        updates: {
          approvedAmounts,
          mlDidError: result.mlDidError,
        },
        error,
      };
    };
  }
}

async function getMlResult({
  nodeName,
  approvalDict,
  approvalResponse,
  modelType,
  scoreLimits,
  oracleConfig,
}: {
  nodeName: string;
  approvalDict: ApprovalDict;
  approvalResponse: AdvanceApprovalResult;
  modelType: UnderwritingModelType;
  scoreLimits: UnderwritingScoreLimits;
  oracleConfig: IOracleConfig;
}): Promise<{
  mlError?: any;
  mlScore?: number;
  mlApprovedAmount: number;
  mlDidRun?: boolean;
  mlDidError?: boolean;
}> {
  try {
    const { score: mlScore } = await MachineLearningDomain.getUnderwritingMlScore(
      {
        userId: approvalDict.userId,
        bankAccountId: approvalDict.bankAccount.id,
        paybackDate: approvalResponse.defaultPaybackDate,
        modelType,
        cacheOnly: approvalDict.mlUseCacheOnly,
      },
      { oracleConfig },
    );

    // find max approved amount from the given ml score
    const mlApprovedAmount: number = reduce(
      scoreLimits,
      (max, scoreLimit, stringAmount) => {
        const amount = parseInt(stringAmount, 10);
        return !isNil(scoreLimit) && mlScore >= scoreLimit && amount > max ? amount : max;
      },
      0,
    );
    dogstatsd.increment('advance_approval.ml_succeeded', {
      nodeName,
      amount: mlApprovedAmount.toString(),
    });
    return {
      mlScore,
      mlApprovedAmount,
      mlDidError: false,
      mlDidRun: true,
    };
  } catch (err) {
    dogstatsd.increment('advance_approval.ml_error', {
      message: err.message,
      nodeName,
    });
    return { mlError: err, mlApprovedAmount: 0, mlDidRun: true, mlDidError: true };
  }
}
