import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Advance } from '../models';
import * as Notification from '../domain/notifications';
import { Transaction } from 'sequelize/types';
import { updateOutstanding } from '../domain/collection';

export default {
  updateDisbursementStatus,
};

/*
 * Advances
 */

interface IUpdateDisbursementStatusOptions {
  transaction?: Transaction;
  sendNotification?: boolean;
}

async function updateDisbursementStatus(
  advance: Advance,
  status: ExternalTransactionStatus,
  options: IUpdateDisbursementStatusOptions = {},
): Promise<void> {
  const { transaction, sendNotification = true } = options;
  await advance.update({ disbursementStatus: status }, { transaction });

  const { Returned, Canceled } = ExternalTransactionStatus;
  if (status === Returned || status === Canceled) {
    await updateOutstanding(advance, { transaction });
    if (sendNotification) {
      await Notification.sendAdvanceDisbursementFailed(advance);
    }
    await advance.destroy({ transaction });
  }
}
