import { isNil } from 'lodash';
import { DecisionNode, ExperimentDecisionNode } from './decision-node';
import { buildRulesApprovalFlow } from './build-engine';
import {
  AdvanceEngineRuleDescription,
  ApprovalDict,
  CaseResolutionStatusDict,
  NodeRuleDescriptionInfo,
} from '../types';

function getRuleDescriptions(
  nodeRuleDescriptionInfos: NodeRuleDescriptionInfo[],
  caseResolutionStatus: CaseResolutionStatusDict,
): AdvanceEngineRuleDescription {
  const advanceEngineRuleDescriptions: AdvanceEngineRuleDescription = {
    passed: [],
    failed: [],
    pending: [],
  };

  // We use afterFailNodeCounter to keep of the next two nodes after the failed node, because those nodes will have explicit description
  let afterFailNodeCounter = 0;
  // We keep track of the current node because a node can have multiple nodeRuleDescriptionInfos
  // If the first one fails, we don't want to decrement afterFailNodeCounter as that is meant for the next new node
  let currentNodeCounter: string;
  let failureReached = false;

  nodeRuleDescriptionInfos.forEach(
    ({ matchingCases, explicitDescription, vagueDescription, isFirstNode, nodeName }) => {
      const isFailure = matchingCases.some(nodeCase => caseResolutionStatus[nodeCase] === false);
      const isPending = isNil(caseResolutionStatus[matchingCases[0]]);

      if (isPending || failureReached) {
        const description = afterFailNodeCounter > 0 ? explicitDescription : vagueDescription;
        afterFailNodeCounter += currentNodeCounter !== nodeName ? -1 : 0;
        advanceEngineRuleDescriptions.pending.push(description);
      } else if (isFailure) {
        afterFailNodeCounter = isFirstNode ? 0 : 2;
        failureReached = true;
        advanceEngineRuleDescriptions.failed.push(explicitDescription);
      } else {
        advanceEngineRuleDescriptions.passed.push(vagueDescription);
      }

      currentNodeCounter = nodeName;
    },
  );

  return advanceEngineRuleDescriptions;
}

function getNodeRuleDescriptionInfos(
  node: DecisionNode,
  approvalDict?: ApprovalDict,
  nodeRuleDescriptionInfos: NodeRuleDescriptionInfo[] = [],
  isFirstNode: boolean = true,
): NodeRuleDescriptionInfo[] {
  if (node.getNodeRuleDescriptionInfo) {
    const descriptionInfos = node.getNodeRuleDescriptionInfo(approvalDict).map(descriptionInfo => {
      return { ...descriptionInfo, isFirstNode };
    });
    isFirstNode = false;
    nodeRuleDescriptionInfos.push(...descriptionInfos);
  }

  if (!node.onSuccessNode) {
    return nodeRuleDescriptionInfos;
  } else {
    // We want to always traverse the tree with onSuccess so that we get the nodes we care about
    // But if we encounter the experiment node, the nodes we care about would be onFailure
    const nextNode =
      node instanceof ExperimentDecisionNode ? node.onFailureNode : node.onSuccessNode;
    return getNodeRuleDescriptionInfos(
      nextNode,
      approvalDict,
      nodeRuleDescriptionInfos,
      isFirstNode,
    );
  }
}

export function getVagueRuleDescriptions(): string[] {
  const engine = buildRulesApprovalFlow();
  const nodeDescriptions = getNodeRuleDescriptionInfos(engine);
  return nodeDescriptions.map(node => node.vagueDescription);
}

export function addRuleDescriptions(
  caseResolutionStatus: CaseResolutionStatusDict,
  approvalDict: ApprovalDict,
): AdvanceEngineRuleDescription {
  const advanceApprovalEngine = buildRulesApprovalFlow();

  if (!caseResolutionStatus) {
    return null;
  }

  const nodeRuleDescriptionInfos = getNodeRuleDescriptionInfos(advanceApprovalEngine, approvalDict);

  return getRuleDescriptions(nodeRuleDescriptionInfos, caseResolutionStatus);
}
