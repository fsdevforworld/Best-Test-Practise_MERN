import { get, groupBy } from 'lodash';

import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { moment } from '@dave-inc/time-lib';

import { Advance, Payment, SubscriptionPayment, TransactionSettlement } from '../../models';

const MODIFICATIONS_COLUMN_NAME = 'modifications';

const MODIFICATION_TRIGGER_PATH = 'metadata.type';

const ADMIN_UPDATE_TRIGGER = 'admin-update';

/**
 * Check for admin updates that set the transaction to canceled,
 * and make them the final source of truth for those transactions
 */
export function hasAdminCancelationOrCompletion(
  transactionRecord: Advance | Payment | SubscriptionPayment | TransactionSettlement,
): boolean {
  /**
   * transactionRecord.hasOwnProperty does not work because `modifications`
   * is inhereited from further up the protoype chain
   */
  if (get(transactionRecord, MODIFICATIONS_COLUMN_NAME, null)) {
    /**
     * Using lodash to handle type inconsistencies. ex. SubscriptionPayment
     * does not have 'modifications', and Advance does not have 'status'
     */
    const modifications = get(transactionRecord, MODIFICATIONS_COLUMN_NAME, []);

    const modificationsByTrigger = groupBy(modifications, MODIFICATION_TRIGGER_PATH);

    const adminUpdateModifications = modificationsByTrigger[ADMIN_UPDATE_TRIGGER];

    const transactionRecordStatus = get(transactionRecord, 'status', '');

    const hasAdminUpdateModifications =
      Boolean(adminUpdateModifications) &&
      Array.isArray(adminUpdateModifications) &&
      adminUpdateModifications.length;

    const isCanceledOrCompleted =
      transactionRecordStatus === ExternalTransactionStatus.Canceled ||
      transactionRecordStatus === ExternalTransactionStatus.Completed;

    if (hasAdminUpdateModifications && isCanceledOrCompleted) {
      return adminUpdateModifications.some(u => {
        const updateStatus = get(u, 'current.status', '');

        const isOldTransaction = moment().diff(moment(transactionRecord.created), 'days') > 90;

        const adminCanceledOrCompleted =
          updateStatus === ExternalTransactionStatus.Canceled ||
          updateStatus === ExternalTransactionStatus.Completed;

        return isOldTransaction && adminCanceledOrCompleted;
      });
    }
  }

  return false;
}
