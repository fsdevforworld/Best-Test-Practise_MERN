import { moment } from '@dave-inc/time-lib';
import { getDecisionCaseError } from '../decision-node';

import { AdvanceApprovalResult, ApprovalDict, IDecisionCaseResponse } from '../../types';

import { BankConnection } from '../../../../models';

/**
 * Determines if the user has connected their first bank account within the configured limit
 *
 * @param {number} maximumDays
 * @returns {(approvalDict: ApprovalDict) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>>}
 */
export function connectedFirstBankAccountWithinLimitCase(
  maximumDays: number,
): (approvalDict: ApprovalDict) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function connectedFirstBankAccountWithinLimit(approvalDict) {
    const firstBankConnection = await BankConnection.findOne({
      where: { userId: approvalDict.userId },
      order: [['created', 'ASC']],
      paranoid: false,
    });
    const firstBankConnectionAgeDays = moment(approvalDict.today).diff(
      firstBankConnection?.created,
      'days',
    );
    const logData = {
      firstBankConnectionAgeDays,
      firstBankConnectionAgeDaysLimit: maximumDays,
    };

    if (firstBankConnectionAgeDays >= maximumDays) {
      return {
        error: getDecisionCaseError('connected-first-bank-account-beyond-limit'),
        logData,
      };
    }

    return {
      logData,
    };
  };
}

/**
 * Determines if the user has taken less than the configured max number of advances
 *
 * @param {number} maxNumberOfAdvancesTakenLimit
 * @returns {(approvalDict: ApprovalDict) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>>}
 */
export function hasTakenUnderMaxNumberOfAdvancesCase(
  maxNumberOfAdvancesTakenLimit: number,
): (approvalDict: ApprovalDict) => Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
  return async function hasTakenUnderMaxNumberOfAdvances(approvalDict) {
    const completedAdvances = approvalDict.advanceSummary.totalAdvancesTaken;
    const logData = {
      numberOfAdvancesTaken: completedAdvances,
      maxNumberOfAdvancesTakenLimit,
    };

    if (completedAdvances > maxNumberOfAdvancesTakenLimit) {
      return {
        error: getDecisionCaseError('taken-more-than-max-number-of-advances'),
        logData,
      };
    }

    return {
      logData,
    };
  };
}
