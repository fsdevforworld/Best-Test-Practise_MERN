import { getConfig } from '@dave-inc/experiment/dist/src/config';
import { DecisionNode } from '../decision-node';
import { ApprovalDict, UnderwritingModelConfigKey } from '../../types';
import { NodeNames } from '../common';
import { ExperimentGateNode, ExperimentId, buildExperimentGateNode } from '../experiments';

import buildMachineLearningNode from './machine-learning-node';

function buildIncomeValidationFailureUWv2Gate(): ExperimentGateNode {
  const experiment = getConfig(UnderwritingModelConfigKey.IncomeValidationFailureUWv2);
  const ratio = experiment.values[0]?.ratio;

  return buildExperimentGateNode({
    experimentId: ExperimentId.IncomeValidationFailureUWv2,
    nodeName: NodeNames.IncomeValidationFailureUWv2,
    description: 'Underwriting Model v2 experiment gate for users who failed income validation',
    isActive: experiment.active,
    ratio,
    limit: experiment.limit,
  });
}

/**
 * Builds the income validation failure global model node, approving based on configured score thresholds
 * with $100 advance and new threshold values.
 *
 * @returns {DecisionNode}
 */
function buildIncomeValidationFailureGMV1(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.IncomeValidationFailureGMV1,
    isExperimental: false,
    modelConfigKey: UnderwritingModelConfigKey.IncomeValidationFailureGMV1,
    dynamicScoreLimits(dict: ApprovalDict) {
      switch (dict.advanceSummary.totalAdvancesTaken) {
        case 0:
          return {
            100: 0.979,
            75: 0.974,
            50: 0.972,
            25: 0.956,
            20: 0.955,
            15: 0.948,
            10: 0.941,
            5: 0.121,
          };
        case 1:
          return {
            100: 0.99,
            75: 0.984,
            50: 0.982,
            25: 0.955,
            20: 0.948,
            15: 0.936,
            10: 0.9,
            5: 0.12,
          };
        case 2:
        case 3:
        case 4:
          return {
            100: 0.993,
            75: 0.986,
            50: 0.984,
            25: 0.953,
            20: 0.951,
            15: 0.946,
            10: 0.897,
            5: 0.037,
          };
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
          return {
            100: 0.996,
            75: 0.985,
            50: 0.981,
            25: 0.96,
            20: 0.952,
            15: 0.94,
            10: 0.905,
            5: 0.025,
          };
        default:
          // 10+
          return {
            100: 0.996,
            75: 0.987,
            50: 0.981,
            25: 0.959,
            20: 0.947,
            15: 0.939,
            10: 0.895,
            5: 0.075,
          };
      }
    },
  });
}

function buildIncomeValidationFailureUWv2(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.IncomeValidationFailureUWv2,
    modelConfigKey: UnderwritingModelConfigKey.IncomeValidationFailureUWv2,
    isExperimental: true,
  });
}

export function buildIncomeValidationFailureML(): DecisionNode {
  const incomeValidationFailureUWv2 = buildIncomeValidationFailureUWv2();
  const incomeValidationFailureGMV1 = buildIncomeValidationFailureGMV1();

  const incomeValidationFailureUWv2Gate = buildIncomeValidationFailureUWv2Gate();
  incomeValidationFailureUWv2Gate.onSuccess(incomeValidationFailureUWv2);
  incomeValidationFailureUWv2Gate.onFailure(incomeValidationFailureGMV1);
  return incomeValidationFailureUWv2Gate;
}
