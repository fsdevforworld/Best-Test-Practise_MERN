import { AdvanceApprovalCreateResponse } from '../../../services/advance-approval/types';
import * as i18next from 'i18next';
import { AdvanceTermsResponse, AdvanceType, PaybackDatesJSON } from '@dave-inc/wire-typings';
import { getAvailableDatesForNoIncome } from '../../../domain/advance-delivery';
import { getFeesByAmount } from '../../../domain/advance-delivery';
import { last } from 'lodash';
import { nextBankingDay } from '../../../lib/banking-days';
import { moment } from '@dave-inc/time-lib';

export function formatAdvanceRejectionResponse(
  approvalResponse: AdvanceApprovalCreateResponse,
  t: i18next.TFunction,
) {
  const { advanceEngineRuleDescriptions, primaryRejectionReason } = approvalResponse;
  let displayMessage = primaryRejectionReason.displayMessage;

  /**
   * Translate one-word message keys. Do NOT translate multi-word
   * messages because i18n does not handle them well. Multi-word
   * messages should slowly be migrated into key-value pairs
   * in the translations directory
   */
  if (displayMessage?.split(' ').length === 1) {
    const interpolations = primaryRejectionReason.extra?.interpolations || undefined;

    displayMessage = t(displayMessage, interpolations);
  }

  return {
    approved: false,
    advanceApprovalId: approvalResponse.id,
    displayMessage,
    message: primaryRejectionReason.message,
    income_needed: primaryRejectionReason.type === 'predicted-income',
    type: primaryRejectionReason.type,
    extra: primaryRejectionReason.extra,
    advanceEngineRuleDescriptions,
    isExperimental: false,
  };
}

/**
 * Serializes available and default payback dates for a given approval
 * Also handles bumping invalid default payback dates to the next banking day
 *
 * @param {AdvanceApprovalCreateResponse} approvalResponse
 * @returns {Promise<PaybackDatesJSON>}
 */
async function getAvailablePaybackDatesJSON(
  approvalResponse: AdvanceApprovalCreateResponse,
): Promise<PaybackDatesJSON> {
  if (!approvalResponse.microAdvanceApproved) {
    return null;
  }

  const availableDates = await getAvailableDatesForNoIncome({
    advanceApprovalId: approvalResponse.id,
  });
  let defaultPaybackDate = approvalResponse.defaultPaybackDate;

  if (!availableDates.includes(defaultPaybackDate)) {
    const rollDirection = defaultPaybackDate > last(availableDates) ? -1 : 1;
    defaultPaybackDate = nextBankingDay(
      moment(approvalResponse.defaultPaybackDate),
      rollDirection,
    ).format('YYYY-MM-DD');
  }

  return {
    available: availableDates,
    default: defaultPaybackDate,
  };
}

export async function formatAdvanceTermsResponse(
  amount: number,
  approvalResponse: AdvanceApprovalCreateResponse,
): Promise<AdvanceTermsResponse> {
  let amountFees;

  if (amount) {
    amountFees = getFeesByAmount(amount);
  }
  let failureMessage = {};
  if (approvalResponse.advanceType === AdvanceType.microAdvance) {
    failureMessage = approvalResponse.rejectionReasons[0];
  }
  return {
    recurringTransactionId: approvalResponse.recurringTransactionId,
    // TODO(melvin): add recurringTransactionUuid
    advanceApprovalId: approvalResponse.id,
    approved: approvalResponse.approved,
    advanceType: approvalResponse.advanceType,
    ...failureMessage,
    advanceEngineRuleDescriptions: approvalResponse.advanceEngineRuleDescriptions,
    approvedAmounts: approvalResponse.approvedAmounts,
    fees: amountFees,
    isExperimental: approvalResponse.isExperimental,
    income: {
      date: approvalResponse.defaultPaybackDate,
      displayName: approvalResponse.paycheckDisplayName || 'paycheck',
    },
    paybackDates: await getAvailablePaybackDatesJSON(approvalResponse),
  };
}
