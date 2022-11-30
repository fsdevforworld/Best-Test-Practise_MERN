import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
} from '../../types';
import { NodeNames } from '../common';

export default class MLDidErrorNode extends DecisionNode {
  public static async isMLError(
    approvalDict: ApprovalDict,
    prev: AdvanceApprovalResult,
    previousNodeUpdates?: Partial<AdvanceApprovalResult>,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!previousNodeUpdates.mlDidError) {
      return {
        error: getDecisionCaseError('ml-not-approved'),
      };
    }
  }

  public cases = [MLDidErrorNode.isMLError];
  public name = NodeNames.MLDidErrorNode;
  public type = DecisionNodeType.Static;
  public isExperimental = false;

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      rejectionReasons: prev.rejectionReasons.concat(errors),
      approvedAmounts: [],
    };
  }
}
