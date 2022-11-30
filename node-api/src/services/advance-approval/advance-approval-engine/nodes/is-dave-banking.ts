import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
} from '../../types';
import { NodeNames } from '../common';

export default class IsDaveBankingNode extends DecisionNode {
  public static async isDaveBanking(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!approvalDict.bankAccount.isDaveBanking) {
      return {
        error: getDecisionCaseError('not-dave-banking'),
      };
    }
  }

  public cases = [IsDaveBankingNode.isDaveBanking];
  public name = NodeNames.isDaveBanking;
  public type = DecisionNodeType.Static;
  public isExperimental = false;

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: prev.rejectionReasons ? prev.rejectionReasons.concat(errors) : errors,
    };
  }
}
