import { MIN_ACCOUNT_AGE, NodeNames } from '../common';
import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
  NodeRuleDescriptionInfo,
} from '../../types';

export default class AccountAgeNode extends DecisionNode {
  public static async accountIsOldEnough(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    const isBelowAccountAgeLimit = approvalDict.accountAgeDays < MIN_ACCOUNT_AGE;
    if (isBelowAccountAgeLimit && approvalDict.bankAccount.isDaveBanking) {
      return {
        logData: {
          bankOfDaveBypass: true,
        },
      };
    }

    if (approvalDict.accountAgeDays < MIN_ACCOUNT_AGE) {
      return {
        error: getDecisionCaseError(
          'account-age',
          `I need to see at least ${MIN_ACCOUNT_AGE} days of bank history to qualify you. You can wait or start banking with Dave now.`,
        ),
      };
    }
  }

  public cases = [AccountAgeNode.accountIsOldEnough];
  public name = NodeNames.AccountAgeNode;
  public type = DecisionNodeType.Static;

  public getNodeRuleDescriptionInfo = (): NodeRuleDescriptionInfo[] => [
    {
      nodeName: NodeNames.AccountAgeNode,
      matchingCases: this.cases.map(nodeCase => nodeCase.name),
      explicitDescription: `My bank account is at least ${MIN_ACCOUNT_AGE} days old`,
      vagueDescription: 'My bank account is at least a few months old',
    },
  ];

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: errors,
    };
  }
}
