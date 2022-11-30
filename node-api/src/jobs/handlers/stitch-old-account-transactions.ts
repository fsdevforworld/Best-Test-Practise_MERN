import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';

import { dogstatsd } from '../../lib/datadog-statsd';
import { BankConnection, BankAccount } from '../../models';
import { copyBankTransactionData } from '../../domain/banking-data-sync';
import { StitchOldAccountTransactionsData } from '../data';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

export const OLD_BBVA_INSTITUTION_ID = 2;
export const NEW_BBVA_INSTITUTION_ID = 268652;

export async function stitchOldAccountTransactions(
  data: StitchOldAccountTransactionsData,
): Promise<void> {
  const { bankConnectionId } = data;

  const bankConnection = await BankConnection.findByPk(bankConnectionId, {
    include: [{ model: BankAccount, as: 'bankAccounts' }],
  });

  if (!bankConnection) {
    return;
  }

  await Bluebird.each(bankConnection.bankAccounts, async account => {
    const accountAge = await account.getAccountAgeFromTransactions();

    if (accountAge > AdvanceApprovalClient.MIN_ACCOUNT_AGE) {
      return;
    }

    const matchingAccount = await BankAccount.findOne({
      where: {
        userId: account.userId,
        bankConnectionId: {
          [Op.ne]: account.bankConnectionId,
        },
        lastFour: account.lastFour,
        displayName: account.displayName,
      },
      order: [['created', 'desc']],
      paranoid: false,
    });

    if (!matchingAccount) {
      return;
    }

    const isBBVAIdChange =
      account.institutionId === NEW_BBVA_INSTITUTION_ID &&
      matchingAccount.institutionId === OLD_BBVA_INSTITUTION_ID;

    if (matchingAccount.institutionId !== account.institutionId && !isBBVAIdChange) {
      return;
    }

    dogstatsd.increment('plaid_updater.historical_update.copying_transaction_from_old_account');
    await copyBankTransactionData(matchingAccount.id, account.id);
  });
}
