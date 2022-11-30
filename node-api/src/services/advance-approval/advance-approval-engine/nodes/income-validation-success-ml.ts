import { getConfig } from '@dave-inc/experiment/dist/src/config';
import { DecisionNode } from '../decision-node';
import { ApprovalDict, UnderwritingModelConfigKey } from '../../types';
import { NodeNames } from '../common';
import { ExperimentGateNode, ExperimentId, buildExperimentGateNode } from '../experiments';

import buildMachineLearningNode from './machine-learning-node';

function buildIncomeValidationSuccessUWv2Gate(): ExperimentGateNode {
  const experiment = getConfig(UnderwritingModelConfigKey.IncomeValidationSuccessUWv2);
  const ratio = experiment.values[0]?.ratio;

  return buildExperimentGateNode({
    experimentId: ExperimentId.IncomeValidationSuccessUWv2,
    nodeName: NodeNames.IncomeValidationSuccessUWv2,
    description: 'Underwriting Model v2 experiment gate for users who passed income validation',
    isActive: experiment.active,
    ratio,
    limit: experiment.limit,
  });
}

/**
 * Builds the income validation success global model node, approving based on configured score thresholds
 * with $100 advance and new threshold values.
 *
 * @returns {DecisionNode}
 */

function buildIncomeValidationSuccessGMV1(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.IncomeValidationSuccessGMV1,
    isExperimental: false,
    modelConfigKey: UnderwritingModelConfigKey.IncomeValidationSuccessGMV1,
    dynamicScoreLimits(dict: ApprovalDict) {
      switch (dict.advanceSummary.totalAdvancesTaken) {
        case 0:
          return {
            100: 0.893,
            75: 0.853,
            50: 0.852,
            25: 0.848,
            20: 0.844,
            15: 0.825,
            10: 0.731,
            5: 0.391,
          };
        case 1:
          return {
            100: 0.96,
            75: 0.936,
            50: 0.935,
            25: 0.927,
            20: 0.925,
            15: 0.907,
            10: 0.84,
            5: 0.309,
          };
        case 2:
        case 3:
        case 4:
          return {
            100: 0.971,
            75: 0.954,
            50: 0.953,
            25: 0.946,
            20: 0.943,
            15: 0.91,
            10: 0.879,
            5: 0.295,
          };
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
          return {
            100: 0.977,
            75: 0.962,
            50: 0.961,
            25: 0.95,
            20: 0.941,
            15: 0.921,
            10: 0.899,
            5: 0.46,
          };
        default:
          // 10+
          return {
            100: 0.984,
            75: 0.966,
            50: 0.965,
            25: 0.941,
            20: 0.928,
            15: 0.909,
            10: 0.899,
            5: 0.385,
          };
      }
    },
  });
}

function buildIncomeValidationSuccessUWv2(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.IncomeValidationSuccessUWv2,
    modelConfigKey: UnderwritingModelConfigKey.IncomeValidationSuccessUWv2,
    isExperimental: true,
  });
}

export function buildIncomeValidationSuccessML(onFailureNode: DecisionNode): DecisionNode {
  const incomeValidationSuccessUWv2 = buildIncomeValidationSuccessUWv2();
  incomeValidationSuccessUWv2.onFailure(onFailureNode);

  const incomeValidationSuccessGMV1 = buildIncomeValidationSuccessGMV1();
  incomeValidationSuccessGMV1.onFailure(onFailureNode);

  const incomeValidationSuccessUWv2Gate = buildIncomeValidationSuccessUWv2Gate();
  incomeValidationSuccessUWv2Gate.onSuccess(incomeValidationSuccessUWv2);
  incomeValidationSuccessUWv2Gate.onFailure(incomeValidationSuccessGMV1);
  return incomeValidationSuccessUWv2Gate;
}
