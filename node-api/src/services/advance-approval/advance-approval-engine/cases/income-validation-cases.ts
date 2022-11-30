import { moment } from '@dave-inc/time-lib';
import { get } from 'lodash';
import { isMoment, Moment } from 'moment';
import { AdvanceApprovalResult, ApprovalDict, IDecisionCaseResponse } from '../../types';
import { getDecisionCaseError } from '../decision-node';
import { RecurringTransactionStatus } from '@dave-inc/wire-typings';
import { RecurringTransaction, IntervalDuration } from '../../recurring-transaction-client';

export function hasIncomeCase(): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function hasIncome(approvalDict) {
    if (!approvalDict.recurringIncome && !approvalDict.incomeOverride) {
      return {
        error: getDecisionCaseError(
          'missing-paycheck',
          'Your bank doesn’t show any reliable income to advance from.',
        ),
      };
    }
  };
}

export function incomeMustBeValidCase({
  includeSingleObservationIncome = false,
}: { includeSingleObservationIncome?: boolean } = {}): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  const validStatuses = [
    RecurringTransactionStatus.VALID,
    ...(includeSingleObservationIncome ? [RecurringTransactionStatus.SINGLE_OBSERVATION] : []),
  ];

  return async function incomeMustBeValid(approvalDict) {
    const logData = {
      validStatuses,
      recurringIncomeStatus: approvalDict.recurringIncome?.status,
    };

    if (
      !approvalDict.incomeOverride &&
      approvalDict.recurringIncome &&
      !validStatuses.includes(approvalDict.recurringIncome.status)
    ) {
      return {
        error: getDecisionCaseError(
          'income-valid',
          'Your bank shows a different pay schedule than what you gave me.',
        ),
        logData,
      };
    }

    return { logData };
  };
}

export function incomeCannotBeWaitingForFirstMatchCase(): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function incomeCannotBeWaitingForFirstMatch(approvalDict) {
    if (
      !approvalDict.incomeOverride &&
      approvalDict.recurringIncome &&
      approvalDict.recurringIncome.status === RecurringTransactionStatus.PENDING_VERIFICATION
    ) {
      return {
        error: getDecisionCaseError(
          'waiting-for-first-match',
          "Your paycheck hasn't arrived in your new account yet.",
        ),
      };
    }
  };
}

export function incomeCannotHaveInvalidNameCase(): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function cannotHaveInvalidName(approvalDict) {
    const noAdminOverride = !approvalDict.incomeOverride;
    const isInvalidTransactionName =
      get(approvalDict, 'recurringIncome.status') === RecurringTransactionStatus.INVALID_NAME;
    if (noAdminOverride && isInvalidTransactionName) {
      const displayName = approvalDict.recurringIncome.transactionDisplayName;
      return {
        error: getDecisionCaseError(
          'income-name-invalid',
          `I can't support ${displayName} as a valid income source just yet.`,
        ),
      };
    }
  };
}

export function incomeCannotBeMissedCase(): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function incomeCannotBeMissed(approvalDict) {
    if (
      !approvalDict.incomeOverride &&
      approvalDict.recurringIncome &&
      isMoment(approvalDict.recurringIncome.missed)
    ) {
      return {
        error: getDecisionCaseError('missed-income', "Your last paycheck hasn't come in yet."),
      };
    }
  };
}

function recurringTransactionIsStale(
  recurringTransaction: RecurringTransaction,
  lastSettled: Moment,
  now: Moment = moment(),
): boolean {
  // Cap at interval duration + 3 days
  const intervalDuration = IntervalDuration[recurringTransaction.rsched.interval];
  if (intervalDuration) {
    return moment()
      .subtract(intervalDuration + 3, 'days')
      .isAfter(lastSettled);
  } else {
    return false;
  }
}

export function incomeMustHaveOccurredRecentlyCase(): (
  approvalDict: ApprovalDict,
) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function incomeMustHaveOccurredRecently(approvalDict) {
    if (approvalDict.incomeOverride || !approvalDict.recurringIncome) {
      return;
    }

    const error = getDecisionCaseError('stale-income', "Your last paycheck hasn't come in yet.");
    const latestTransaction = approvalDict.previousPaychecks[0];
    if (!latestTransaction) {
      return { error };
    }

    const isStale = recurringTransactionIsStale(
      approvalDict.recurringIncome,
      moment(latestTransaction.transactionDate),
      approvalDict.today,
    );
    if (isStale) {
      return { error };
    }
  };
}
