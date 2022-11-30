import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  NodeRuleDescriptionInfo,
} from '../../types';
import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  APPROVED_AMOUNTS_BY_MAX_AMOUNT,
  getFormattedCaseName,
  NodeNames,
  SOLVENCY_AMOUNT,
} from '../common';

const DESCRIPTION =
  'I keep enough money in my account for a few days after payday to pay a few bills';

export default class PaydaySolvencyNode extends DecisionNode {
  public solvencyAmount: number;
  public cases = [this.historicalPaydaySolvency.bind(this)];
  public name = NodeNames.PaydaySolvencyNode;
  public type = DecisionNodeType.Static;

  constructor(solvencyAmount: number = SOLVENCY_AMOUNT) {
    super();
    this.solvencyAmount = solvencyAmount;
    this.metadata = { solvencyAmount };
  }

  public async historicalPaydaySolvency(approvalDict: ApprovalDict) {
    if (
      !approvalDict.incomeOverride &&
      approvalDict.recurringIncome &&
      approvalDict.previousPaychecks.length
    ) {
      const maxAccountBalance = approvalDict.lastPaycheckAccountBalance;
      const logData = {
        paychecks: approvalDict.previousPaychecks,
        lastPaycheckAccountBalance: maxAccountBalance,
        solvencyAmount: this.solvencyAmount,
      };

      if (maxAccountBalance < this.solvencyAmount) {
        return {
          error: getDecisionCaseError(
            'historical-payday-insolvent',
            'Sorry, but I can’t. \n Dave Tip: Keeping even a small balance at the end of payday makes your account stronger.',
            {
              path:
                'articles/360001266552--For-your-safety-I-need-to-see-a-cushion-of-at-least-115-the-day-after-your-last-2-paydays-',
            },
          ),
          logData,
        };
      }

      return { logData };
    }
  }

  public getNodeRuleDescriptionInfo = (): NodeRuleDescriptionInfo[] => [
    {
      nodeName: NodeNames.PaydaySolvencyNode,
      matchingCases: this.cases.map(nodeCase => getFormattedCaseName(nodeCase)),
      explicitDescription: DESCRIPTION,
      vagueDescription: DESCRIPTION,
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
      rejectionReasons: prev.rejectionReasons ? errors.concat(prev.rejectionReasons) : errors,
    };
  }

  protected afterAllCases(dict: ApprovalDict, prev: AdvanceApprovalResult): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: APPROVED_AMOUNTS_BY_MAX_AMOUNT[75],
    };
  }
}
