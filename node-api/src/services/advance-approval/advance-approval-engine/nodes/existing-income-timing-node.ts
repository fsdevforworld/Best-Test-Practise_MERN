import { isNil } from 'lodash';
import { Moment } from 'moment';
import { DecisionNode, getDecisionCaseError } from '../decision-node';
import { moment } from '@dave-inc/time-lib';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
} from '../../types';
import { AdvanceFailureMessageKey } from '../../../../translations';
import { NodeNames } from '../common';
import RecurringTransactionClient from '../../recurring-transaction-client';

export const MAX_DAYS_UNTIL_PAYCHECK = 14;
const REMAINING_DAY_TOMORROW = 1;

export default class ExistingIncomeTimingNode extends DecisionNode {
  public static async cannotBePaidToday(dict: ApprovalDict) {
    const { incomeOverride, expectedPaycheck, today, recurringIncome, userTimezone } = dict;
    const paycheckDate = incomeOverride ? incomeOverride.payDate : expectedPaycheck.expectedDate;
    const paycheckDateInUserTime = moment(paycheckDate).tz(userTimezone, true);
    if (paycheckDateInUserTime.isSame(today, 'days')) {
      let daysRemainingTillAdvance;
      if (recurringIncome) {
        const nextExpectedTransaction = await RecurringTransactionClient.getNextExpectedTransaction(
          {
            recurringTransactionId: recurringIncome.id,
            after: today,
          },
        );
        const nextDateStr = moment(nextExpectedTransaction.expectedDate);
        const nextExpectedPaycheckDateInUserTime = moment(nextDateStr).tz(userTimezone, true);
        daysRemainingTillAdvance = ExistingIncomeTimingNode.daysUntilNextAdvanceAllowed(
          today,
          nextExpectedPaycheckDateInUserTime,
        );
      }

      let remainingDays;
      if (daysRemainingTillAdvance > 1) {
        remainingDays = daysRemainingTillAdvance;
      } else if (!isNil(daysRemainingTillAdvance)) {
        remainingDays = REMAINING_DAY_TOMORROW;
      }

      return {
        error: getDecisionCaseError('payday-today', AdvanceFailureMessageKey.CannotBePaidToday, {
          displayMessage: AdvanceFailureMessageKey.CannotBePaidToday,
          extra: {
            interpolations: {
              remainingDays,
            },
          },
        }),
      };
    }
  }

  public static async daysUntilNextPaycheck({
    incomeOverride,
    expectedPaycheck,
    today,
    userTimezone,
  }: ApprovalDict) {
    const paycheckDate = incomeOverride ? incomeOverride.payDate : expectedPaycheck.expectedDate;
    const paycheckDateInUserTime = moment(paycheckDate).tz(userTimezone, true);

    if (paycheckDateInUserTime.diff(today, 'days', true) > MAX_DAYS_UNTIL_PAYCHECK) {
      return {
        error: getDecisionCaseError(
          'predicted-upcoming-income',
          AdvanceFailureMessageKey.PredictedUpcomingIncome,
          {
            displayMessage: AdvanceFailureMessageKey.PredictedUpcomingIncome,
            extra: {
              interpolations: {
                remainingDays: ExistingIncomeTimingNode.daysUntilNextAdvanceAllowed(
                  today,
                  paycheckDateInUserTime,
                ),
              },
            },
          },
        ),
      };
    }
  }

  private static daysUntilNextAdvanceAllowed(today: Moment, paycheckDate: Moment): number {
    const remainingDaysUntilPaycheck = Math.ceil(paycheckDate.diff(today, 'days', true));

    return remainingDaysUntilPaycheck - MAX_DAYS_UNTIL_PAYCHECK;
  }

  public cases = [
    ExistingIncomeTimingNode.cannotBePaidToday,
    ExistingIncomeTimingNode.daysUntilNextPaycheck,
  ];
  public name = NodeNames.ExistingIncomeTimingNode;
  public type = DecisionNodeType.Static;

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult | null,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      rejectionReasons: prev.rejectionReasons ? prev.rejectionReasons.concat(errors) : errors,
      approvedAmounts: [],
    };
  }
}
