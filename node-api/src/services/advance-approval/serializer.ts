import AdvanceApproval from '../../models/advance-approval';
import { AdvanceApprovalGetResponse } from './types';
import { moment } from '@dave-inc/time-lib';

export function serializeAdvanceApproval(
  advanceApproval: AdvanceApproval,
): AdvanceApprovalGetResponse {
  return {
    id: advanceApproval.id,
    bankAccountId: advanceApproval.bankAccountId,
    userId: advanceApproval.userId,
    approvedAmounts: advanceApproval.approvedAmounts,
    defaultPaybackDate: advanceApproval.defaultPaybackDate.ymd(),
    approved: advanceApproval.approved,
    created: advanceApproval.created.format(),
    recurringTransactionId: advanceApproval.recurringTransactionId,
    recurringTransactionUuid: advanceApproval.recurringTransactionUuid,
    expectedTransactionId: advanceApproval.expectedTransactionId,
    expectedTransactionUuid: advanceApproval.expectedTransactionUuid,
    primaryRejectionReason: advanceApproval.primaryRejectionReason,
    normalAdvanceApproved: advanceApproval.normalAdvanceApproved,
    microAdvanceApproved: advanceApproval.microAdvanceApproved,
    expired: advanceApproval.created.isBefore(moment().subtract(1, 'day')),
    expiresAt: advanceApproval.created.add(1, 'day').format(),
  };
}
