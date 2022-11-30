import { getConfig } from '@dave-inc/experiment/dist/src/config';
import { DecisionNode } from '../decision-node';
import { ApprovalDict, UnderwritingModelConfigKey } from '../../types';
import { NodeNames } from '../common';
import { ExperimentGateNode, ExperimentId, buildExperimentGateNode } from '../experiments';

import buildMachineLearningNode from './machine-learning-node';

function buildDaveBankingUWv2Gate(): ExperimentGateNode {
  const experiment = getConfig(UnderwritingModelConfigKey.DaveBankingUWv2);
  const ratio = experiment.values[0]?.ratio;

  return buildExperimentGateNode({
    experimentId: ExperimentId.DaveBankingUWv2_1,
    nodeName: NodeNames.DaveBankingUWv2_1,
    description: 'Underwriting Model v2.1 experiment gate for Dave Banking users',
    isActive: experiment.active,
    ratio,
    limit: experiment.limit,
  });
}

/**
 * Builds the $200 dave banking node
 *
 * @returns {DecisionNode}
 */
function buildDaveBankingGMV1(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.DaveBankingGMV1,
    modelConfigKey: UnderwritingModelConfigKey.DaveBankingGMV1,
    isExperimental: false,
    dynamicScoreLimits(dict: ApprovalDict) {
      switch (dict.advanceSummary.totalAdvancesTaken) {
        case 0:
          return { 200: 0.7 };
        case 1:
          return { 200: 0.939, 100: 0.826 };
        case 2:
        case 3:
        case 4:
          return { 200: 0.967, 100: 0.675 };
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
          return { 200: 0.974, 100: 0.793 };
        default:
          return { 200: 0.937, 100: 0.937 };
      }
    },
  });
}

function buildDaveBankingUWv2(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.DaveBankingUWv2_1,
    modelConfigKey: UnderwritingModelConfigKey.DaveBankingUWv2,
    isExperimental: true,
  });
}

export function buildDaveBankingML(onFailureNode: DecisionNode): DecisionNode {
  const daveBankingUWv2 = buildDaveBankingUWv2();
  daveBankingUWv2.onFailure(onFailureNode);

  const daveBankingGMV1 = buildDaveBankingGMV1();
  daveBankingGMV1.onFailure(onFailureNode);

  const daveBankingUWv2Gate = buildDaveBankingUWv2Gate();
  daveBankingUWv2Gate.onSuccess(daveBankingUWv2);
  daveBankingUWv2Gate.onFailure(daveBankingGMV1);
  return daveBankingUWv2Gate;
}
