import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';
import { get } from 'lodash';
import { Op } from 'sequelize';
import { BankAccountSubtype, BankingDataSource } from '@dave-inc/wire-typings';

import { BankAccount, BankConnection, BankConnectionTransition, User } from '../../models';
import { IDaveBankingAccountClosed } from '../../typings';
import { deleteBankAccount } from '../banking-data-sync/delete-bank-account';
import { lockAndRun } from '../../lib/redis-lock';

export class CloseDaveBankingAccountError extends Error {
  constructor(public reason: CloseDaveBankingAccountErrorReason, public data?: any) {
    super('Failed to process dave banking account closure on overdraft');
  }
}

export enum CloseDaveBankingAccountErrorReason {
  BANK_ACCOUNT_NOT_FOUND = 'bank_account_not_found',
  BANK_CONNECTION_NOT_FOUND = 'bank_connection_not_found',
  BANK_CONNECTION_DELETE_FAILED = 'bank_connection_delete_failed',
  LOCK_EXCEEDED = 'redis_lock_exceeded',
}

export async function closeDaveBankingAccount({ daveBankingAccountId }: IDaveBankingAccountClosed) {
  const daveBankAccount = await BankAccount.findOne({
    include: [{ model: BankConnection, include: [User] }],
    where: {
      externalId: daveBankingAccountId,
    },
    paranoid: false,
  });

  if (!daveBankAccount) {
    throw new CloseDaveBankingAccountError(
      CloseDaveBankingAccountErrorReason.BANK_ACCOUNT_NOT_FOUND,
    );
  }

  const { bankConnection } = daveBankAccount;

  if (bankConnection.bankingDataSource !== BankingDataSource.BankOfDave) {
    throw new CloseDaveBankingAccountError(
      CloseDaveBankingAccountErrorReason.BANK_CONNECTION_NOT_FOUND,
    );
  }

  const { completed } = await lockAndRun(
    `dave-banking-close-account-lock-${bankConnection.userId}`,
    () => cleanUpAccountAndConnection(daveBankAccount, bankConnection),
  );

  if (!completed) {
    throw new CloseDaveBankingAccountError(CloseDaveBankingAccountErrorReason.LOCK_EXCEEDED);
  }
}

async function cleanUpAccountAndConnection(
  daveBankAccount: BankAccount,
  bankConnection: BankConnection,
) {
  // see if other accounts exist.  if they do, keep bank connection
  const otherAccounts = await BankAccount.count({
    where: {
      bankConnectionId: bankConnection.id,
      id: { [Op.ne]: daveBankAccount.id },
    },
  });

  const { user } = bankConnection;
  try {
    if (otherAccounts === 0) {
      if (!bankConnection.deleted) {
        // this clears out the default account as well
        await deleteBankConnection(bankConnection, { validate: false });
      }
    } else {
      // delete the single account, leaving connection and other accounts intact
      await deleteBankAccount(daveBankAccount, user);
    }
  } catch (error) {
    throw new CloseDaveBankingAccountError(
      CloseDaveBankingAccountErrorReason.BANK_CONNECTION_DELETE_FAILED,
      {
        innerError: error,
      },
    );
  }

  // if we're deleting the spending account,
  // we need to reset default bank connections and transitions
  if (daveBankAccount.subtype === BankAccountSubtype.Checking) {
    await BankConnectionTransition.destroy({
      where: {
        [Op.or]: [
          { fromBankConnectionId: bankConnection.id },
          { toBankConnectionId: bankConnection.id },
        ],
      },
    });

    if (user.defaultBankAccountId === daveBankAccount.id) {
      const previousBankConnection = await BankConnection.findOne({
        where: {
          userId: user.id,
          bankingDataSource: {
            [Op.not]: BankingDataSource.BankOfDave,
          },
        },
      });

      const defaultBankAccountId = get(previousBankConnection, 'primaryBankAccountId', null);

      await user.update({ defaultBankAccountId });
    }
  }
}
