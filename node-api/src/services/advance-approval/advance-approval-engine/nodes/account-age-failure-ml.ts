import { getConfig } from '@dave-inc/experiment/dist/src/config';
import { DecisionNode } from '../decision-node';
import { UnderwritingModelConfigKey } from '../../types';
import { NodeNames } from '../common';
import { ExperimentGateNode, ExperimentId, buildExperimentGateNode } from '../experiments';
import buildMachineLearningNode from './machine-learning-node';

function buildAccountAgeFailureUWv2Gate(): ExperimentGateNode {
  const experiment = getConfig(UnderwritingModelConfigKey.AccountAgeFailureUWv2);
  const ratio = experiment.values[0]?.ratio;

  return buildExperimentGateNode({
    experimentId: ExperimentId.AccountAgeFailureUWv2_1,
    nodeName: NodeNames.AccountAgeFailureUWv2_1,
    description: 'Underwriting Model v2.1 experiment gate for Account Age check failure users',
    isActive: experiment.active,
    ratio,
    limit: experiment.limit,
  });
}

function buildAccountAgeFailureUWv2(): DecisionNode {
  return buildMachineLearningNode({
    name: NodeNames.AccountAgeFailureUWv2_1,
    modelConfigKey: UnderwritingModelConfigKey.AccountAgeFailureUWv2,
    isExperimental: true,
  });
}

export function buildAccountAgeFailureML(): DecisionNode {
  const accountAgeFailureUWv2 = buildAccountAgeFailureUWv2();

  const accountAgeFailureGMV1 = buildMachineLearningNode({
    name: NodeNames.AccountAgeFailureGMV1,
    modelConfigKey: UnderwritingModelConfigKey.AccountAgeFailureGMV1,
  });

  const accountAgeFailureUWv2Gate = buildAccountAgeFailureUWv2Gate();
  accountAgeFailureUWv2Gate.onSuccess(accountAgeFailureUWv2);
  accountAgeFailureUWv2Gate.onFailure(accountAgeFailureGMV1);
  return accountAgeFailureUWv2Gate;
}
