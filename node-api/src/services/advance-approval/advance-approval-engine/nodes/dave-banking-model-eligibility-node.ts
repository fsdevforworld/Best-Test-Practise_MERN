import { isEmpty, isNil, last, sortBy, sum } from 'lodash';
import { BankTransaction } from '@dave-inc/heath-client';
import { moment, Moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import { DecisionNode, getDecisionCaseError } from '../decision-node';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
} from '../../types';
import { RecurringTransaction } from '../../recurring-transaction-client';
import { NodeNames } from '../common';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';

function isMonthly(income: RecurringTransaction): boolean {
  return (
    income.rsched.interval === RecurringTransactionInterval.MONTHLY ||
    income.rsched.interval === RecurringTransactionInterval.WEEKDAY_MONTHLY
  );
}

export default class DaveBankingModelEligibilityNode extends DecisionNode {
  public static MonthlyIncomeMinimum = 1000;

  // Look back up to this many days to find the previous paycheck
  public static IncomeLookBackDays = 34;

  // Time window over which paychecks are considered to be from
  // the same month.
  // We want to be fuzzy, but not capture extra paychecks. The longest
  // spread of paychecks in a month shuld be for the first and last
  // WEEKLY paychecks, which is 3 weeks + 1 day. Add 3 days buffer for
  // transaction settlemnent
  public static PaycheckTimeWindow = 25;

  public static performIncomeCheck(
    recurringIncome: RecurringTransaction,
    previousPaychecks: BankTransaction[],
    today: Moment = moment()
      .tz(PACIFIC_TIMEZONE, true)
      .startOf('day'),
  ) {
    if (previousPaychecks.length < 2) {
      return { checkFailure: getDecisionCaseError('needs-two-direct-deposits') };
    }

    let paycheckAmounts: number[];
    let monthTotalAmount: number;
    let checkFailure: DecisionCaseError;

    const sortedPaychecks = sortBy(previousPaychecks, 'transactionDate');
    const mostRecent = last(sortedPaychecks);
    const mostRecentPaycheckDate = moment(mostRecent.transactionDate);

    if (today.diff(mostRecentPaycheckDate, 'days') >= this.IncomeLookBackDays) {
      return { checkFailure: getDecisionCaseError('no-recent-paychecks') };
    }

    const paychecksLastMonth = sortedPaychecks.filter(
      p => mostRecentPaycheckDate.diff(p.transactionDate, 'days') < this.PaycheckTimeWindow,
    );
    paycheckAmounts = paychecksLastMonth.map(p => p.amount);
    monthTotalAmount = sum(paycheckAmounts);

    if (monthTotalAmount < this.MonthlyIncomeMinimum) {
      checkFailure = getDecisionCaseError('direct-deposits-too-small');
    } else if (isMonthly(recurringIncome)) {
      // For monthly paycheck, we need to verify one extra month further back
      // To be robust, still consider the possibility for multiple checks in one month
      const lastPaycheckDate = moment(paychecksLastMonth[0].transactionDate);
      const extraMonthPaychecks = sortedPaychecks.filter(p => {
        const dayDiff = lastPaycheckDate.diff(p.transactionDate, 'days');
        return dayDiff > 0 && dayDiff < this.IncomeLookBackDays;
      });
      const extraMonthAmounts = extraMonthPaychecks.map(p => p.amount);
      paycheckAmounts = [...extraMonthAmounts, ...paycheckAmounts];

      if (isEmpty(extraMonthPaychecks) || sum(extraMonthAmounts) < this.MonthlyIncomeMinimum) {
        checkFailure = getDecisionCaseError('monthly-income-insufficient-history');
      }
    }

    return {
      paycheckAmounts,
      monthTotalAmount,
      checkFailure,
    };
  }

  public static async hasDirectDepositMinimums(approvalDict: ApprovalDict) {
    const logData: any = {
      interval: approvalDict.recurringIncome.rsched.interval,
    };

    const incomeCheckResult = DaveBankingModelEligibilityNode.performIncomeCheck(
      approvalDict.recurringIncome,
      approvalDict.previousPaychecks,
    );
    logData.paycheckAmounts = incomeCheckResult.paycheckAmounts;
    logData.monthTotalAmount = incomeCheckResult.monthTotalAmount;

    if (!isNil(incomeCheckResult.checkFailure)) {
      return {
        error: incomeCheckResult.checkFailure,
        logData,
      };
    }

    return { logData };
  }

  public cases = [DaveBankingModelEligibilityNode.hasDirectDepositMinimums];
  public name = NodeNames.DaveBankingModelEligibilityNode;
  public type = DecisionNodeType.Static;
  public isExperimental = false;

  protected onError(
    errors: DecisionCaseError[],
    approvalDict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: prev.rejectionReasons ? prev.rejectionReasons.concat(errors) : errors,
    };
  }
}
