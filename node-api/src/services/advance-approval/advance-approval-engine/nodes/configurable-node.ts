import { DecisionNode } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCase,
  DecisionCaseError,
  DecisionNodeType,
  NodeRuleDescriptionInfo,
} from '../../types';

type ConfigurableNodeParams = {
  name: string;
  type: DecisionNodeType;
  isExperimental?: boolean;
  cases: Array<DecisionCase<AdvanceApprovalResult>>;
  metadata?: { [key: string]: any };
  getNodeRuleDescriptionInfo?: () => NodeRuleDescriptionInfo[];
  afterAllCases?: (
    dict: ApprovalDict,
    prev: AdvanceApprovalResult | null,
  ) => AdvanceApprovalResult | Promise<AdvanceApprovalResult>;
  onError: (
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult | null,
  ) => AdvanceApprovalResult;
};

/**
 * Builds a decision node that is completely configured by the provided params
 *
 * @param {ConfigurableNodeParams} params
 * @returns {ConfigurableNode}
 */
export default function buildNode(params: ConfigurableNodeParams): DecisionNode {
  return new ConfigurableNode(params);
}

class ConfigurableNode extends DecisionNode {
  public readonly name: string;
  public readonly type: DecisionNodeType;
  public readonly cases: Array<DecisionCase<AdvanceApprovalResult>> = [];
  public readonly metadata: { [key: string]: any };

  public constructor({
    name,
    type,
    cases,
    metadata = {},
    getNodeRuleDescriptionInfo,
    afterAllCases,
    onError,
    isExperimental = false,
  }: ConfigurableNodeParams) {
    super();
    this.name = name;
    this.type = type;
    this.cases = cases;
    this.metadata = metadata;
    this.isExperimental = isExperimental;

    if (getNodeRuleDescriptionInfo) {
      this.getNodeRuleDescriptionInfo = getNodeRuleDescriptionInfo;
    }

    if (afterAllCases) {
      this.afterAllCases = afterAllCases;
    }

    if (onError) {
      this.onError = onError;
    }
  }
}
