import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  NodeRuleDescriptionInfo,
} from '../../types';
import { groupBy } from 'lodash';
import {
  getFormattedCaseName,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT_DAVE_BANKING,
  NodeNames,
} from '../common';
import { moment } from '@dave-inc/time-lib';
import { BankTransaction } from '@dave-inc/heath-client';

const DESCRIPTION = 'My paychecks average at least a few hundred dollars';

export default class LowIncomeNode extends DecisionNode {
  public static getIncomeAmountAverage(previousPaychecks: BankTransaction[]) {
    if (previousPaychecks.length === 0) {
      return 0;
    }
    const grouped = groupBy(
      previousPaychecks,
      (paycheck: BankTransaction) => paycheck.transactionDate,
    );
    const summed: Array<Partial<BankTransaction>> = Object.values(grouped).map(
      (sameDay: BankTransaction[]) => {
        return sameDay.reduce(
          (acc: Partial<BankTransaction>, day: BankTransaction) => {
            acc.amount += day.amount;
            acc.transactionDate = day.transactionDate;

            return acc;
          },
          { amount: 0, transactionDate: null },
        );
      },
    );
    const sorted = summed.sort((a, b) => moment(b.transactionDate).diff(a.transactionDate));

    const lastTwo = sorted.slice(0, 2).map(p => p.amount);
    const sum = lastTwo.reduce((acc, p) => acc + p, 0);
    const average = sum / lastTwo.length;

    return average;
  }
  public cases = [this.minIncomeAmount.bind(this)];
  public name = NodeNames.LowIncomeNode;
  public type = DecisionNodeType.Static;
  public metadata = {
    minimumAverageIncomeDaveBanking: MINIMUM_APPROVAL_PAYCHECK_AMOUNT_DAVE_BANKING,
    minimumAverageIncome: MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  };

  public getMinimumApprovalAmount(approvalDict?: ApprovalDict) {
    const isDaveBanking = approvalDict?.bankAccount.isDaveBanking;
    return isDaveBanking
      ? MINIMUM_APPROVAL_PAYCHECK_AMOUNT_DAVE_BANKING
      : MINIMUM_APPROVAL_PAYCHECK_AMOUNT;
  }

  public async minIncomeAmount(approvalDict: ApprovalDict) {
    const minimumPaycheckApprovalAmount = this.getMinimumApprovalAmount(approvalDict);
    if (!approvalDict.incomeOverride && approvalDict.previousPaychecks.length) {
      const average = approvalDict.incomeAmountAverage;
      const logData = {
        incomeAmountAverage: average,
        minimumPaycheckApprovalAmount,
      };
      if (average < minimumPaycheckApprovalAmount) {
        return {
          error: getDecisionCaseError(
            'low-income-amount',
            'Your income is too low to advance from.',
          ),
          logData,
        };
      }

      return { logData };
    }
  }

  public getNodeRuleDescriptionInfo = (approvalDict?: ApprovalDict): NodeRuleDescriptionInfo[] => {
    return [
      {
        nodeName: NodeNames.LowIncomeNode,
        matchingCases: this.cases.map(nodeCase => getFormattedCaseName(nodeCase)),
        explicitDescription: DESCRIPTION,
        vagueDescription: DESCRIPTION,
      },
    ];
  };

  protected onError(
    errors: DecisionCaseError[],
    approvalDict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: prev.rejectionReasons ? errors.concat(prev.rejectionReasons) : errors,
    };
  }
}
