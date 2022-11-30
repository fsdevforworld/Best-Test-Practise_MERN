import {
  Advance,
  BankAccount,
  BankConnection,
  PaymentMethod,
  RecurringTransaction,
} from '../../models';
import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import { chunk } from 'lodash';
import { sequelize, AuditLog } from '../../models';
import HeathClient from '../../lib/heath-client';
import { fetchAndSyncBankTransactions } from './bank-transactions';
import * as RecurringTransactionDomain from '../recurring-transaction';
import { MicroDeposit } from '@dave-inc/wire-typings';
import { BankTransactionCreate, SortOrder } from '@dave-inc/heath-client';
import { moment } from '@dave-inc/time-lib';
import { BankingDataSyncSource } from '../../typings';
import { paymentMethodUpdateEvent } from '../event';
import logger from '../../lib/logger';

export async function copyBankAccountData(
  oldBankAccount: BankAccount,
  newBankAccount: BankAccount,
  connection: BankConnection,
) {
  const { paymentMethods, recurringTransactions, advances } = await Bluebird.props({
    paymentMethods: PaymentMethod.findAll({
      where: { bankAccountId: oldBankAccount.id },
    }),
    recurringTransactions: RecurringTransactionDomain.getByBankAccount(oldBankAccount.id),
    advances: Advance.findAll({
      where: { bankAccountId: oldBankAccount.id, outstanding: { [Op.gt]: 0 } },
    }),
  });

  await sequelize.transaction(async transaction => {
    await PaymentMethod.update(
      { bankAccountId: newBankAccount.id },
      { where: { bankAccountId: oldBankAccount.id }, transaction },
    );

    await RecurringTransaction.update(
      { bankAccountId: newBankAccount.id },
      { where: { bankAccountId: oldBankAccount.id }, transaction },
    );

    await Advance.update(
      { bankAccountId: newBankAccount.id },
      { where: { bankAccountId: oldBankAccount.id, outstanding: { [Op.gt]: 0 } }, transaction },
    );

    // update bank account fields
    const updates: Partial<BankAccount> = {
      synapseNodeId: oldBankAccount.synapseNodeId,
      defaultPaymentMethodId: oldBankAccount.defaultPaymentMethodId,
      mainPaycheckRecurringTransactionId: oldBankAccount.mainPaycheckRecurringTransactionId,
      mainPaycheckRecurringTransactionUuid: oldBankAccount.mainPaycheckRecurringTransactionUuid,
      risepayId: oldBankAccount.risepayId,
    };
    if (oldBankAccount.accountNumber && !newBankAccount.accountNumber) {
      updates.accountNumber = oldBankAccount.accountNumber;
      updates.accountNumberAes256 = oldBankAccount.accountNumberAes256;
    }
    if (!newBankAccount.lastFour) {
      updates.lastFour = oldBankAccount.lastFour;
    }
    await oldBankAccount.update(
      {
        synapseNodeId: null,
        defaultPaymentMethodId: null,
        mainPaycheckRecurringTransactionId: null,
        mainPaycheckRecurringTransactionUuid: null,
        risepayId: null,
        accountNumber: null,
        accountNumberAes256: null,
      },
      { transaction },
    );

    await newBankAccount.update(updates, { transaction });
    await oldBankAccount.destroy({ transaction });

    // Update user's default bank account id
    const user = await oldBankAccount.getUser({ transaction });
    if (user.defaultBankAccountId === oldBankAccount.id) {
      await user.update({ defaultBankAccountId: newBankAccount.id }, { transaction });
    }
    // Update bank connection's primary bank account id
    if (connection.primaryBankAccountId === oldBankAccount.id) {
      await connection.update({ primaryBankAccountId: newBankAccount.id }, { transaction });
    }

    await AuditLog.create(
      {
        type: 'BANK_ACCOUNT_COPY',
        eventUuid: newBankAccount.id,
        userId: user.id,
        extra: {
          updatedAccountFields: updates,
          deletedAccount: oldBankAccount,
          newAccount: newBankAccount,
          movedAdvanceIds: advances.map(a => a.id),
          movedPaymentMethodIds: paymentMethods.map(p => p.id),
          movedRecurringIds: recurringTransactions.map(r => r.id),
        },
      },
      { transaction },
    );
  });

  try {
    await paymentMethodUpdateEvent.publish({
      operation: 'update',
      paymentMethod: { oldBankAccountId: oldBankAccount.id, newBankAccountId: newBankAccount.id },
    });
  } catch (error) {
    logger.warn('Failed to publish payment method update', {
      error,
      oldBankAccountId: oldBankAccount.id,
      newBankAccountId: newBankAccount.id,
    });
  }

  // historical pull and update any missed expected transactions
  await fetchAndSyncBankTransactions(connection, {
    historical: true,
    source: BankingDataSyncSource.BankTransactionCopy,
  });

  // copy over bank transaction data
  await copyBankTransactionData(oldBankAccount.id, newBankAccount.id);
}

export async function copyBankTransactionData(fromBankAccountId: number, toBankAccountId: number) {
  const transaction = await HeathClient.getSingleBankTransaction(
    toBankAccountId,
    {},
    {
      order: { transactionDate: SortOrder.ASC },
    },
  );
  const minTransactionDate = transaction?.transactionDate || moment();
  const allOldTransactions = await HeathClient.getBankTransactions(fromBankAccountId, {
    transactionDate: {
      lte: moment(minTransactionDate)
        .subtract(1, 'day')
        .ymd(),
    },
  });
  const copies: BankTransactionCreate[] = allOldTransactions.map(trans => {
    return {
      ...trans,
      externalId: `${trans.externalId}-copy-${toBankAccountId}`,
      id: null,
      bankAccountId: toBankAccountId,
    };
  });
  // avoid large data lists being sent to the api
  await Bluebird.map(chunk(copies, 10), (transactions: BankTransactionCreate[]) => {
    return HeathClient.createBankTransactions(transactions);
  });
}

export async function getAccountAndRoutingFromOldAccounts(
  accounts: BankAccount[],
): Promise<BankAccount[]> {
  const accountPairs: Array<{
    oldAccount: BankAccount;
    newAccount: BankAccount;
  }> = await Bluebird.reduce(
    accounts,
    async (acc, newAccount) => {
      const oldAccount = await BankAccount.findOne({
        where: {
          id: {
            [Op.ne]: newAccount.id,
          },
          institutionId: newAccount.institutionId,
          userId: newAccount.userId,
          lastFour: newAccount.lastFour,
          displayName: newAccount.displayName,
          // Do not carry over accounts that require a micro deposit
          [Op.or]: [
            { microDeposit: MicroDeposit.COMPLETED },
            { microDeposit: MicroDeposit.NOT_REQUIRED }, // We don't currently use this in the database, but putting it now in case we start using it.
            { microDeposit: null },
          ],
        },
      });

      if (oldAccount) {
        return acc.concat({ oldAccount, newAccount });
      }

      return acc;
    },
    [],
  );

  if (accountPairs.length !== accounts.length) {
    return null;
  }

  return Bluebird.map(accountPairs, async ({ newAccount, oldAccount }) => {
    await newAccount.update({
      accountNumber: oldAccount.accountNumber,
      accountNumberAes256: oldAccount.accountNumberAes256,
    });

    return newAccount;
  });
}
