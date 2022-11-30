import { includes } from 'lodash';
import { NewRecurringTransaction } from './detect-recurring-transaction';
import { newRecurringTransactionEvent } from '../event';
import { getBankAccount } from './utils';
import { getApprovalBankAccount } from '../advance-approval-request';
import AdvanceApprovalClient from '../../lib/advance-approval-client';
import { INewRecurringTransactionData, TransactionType } from '../../typings';

export async function publishNewRecurringTransaction(
  newRecurringTransaction: NewRecurringTransaction,
): Promise<void> {
  const rt = newRecurringTransaction.transaction;

  const newEvent: INewRecurringTransactionData = {
    recurringTransactionId: rt.id,
    userId: rt.userId,
    bankAccountId: rt.bankAccountId,
    type: rt.type,
    averageAmount: rt.userAmount,
    minimumAmount: newRecurringTransaction.minAmount,
    institutionId: newRecurringTransaction.institutionId,
  };

  if (rt.type === TransactionType.INCOME) {
    const bankAccount = await getBankAccount(rt);
    const preQualify = await AdvanceApprovalClient.preQualifyUser({
      userId: rt.userId,
      bankAccount: await getApprovalBankAccount(bankAccount),
    });

    if (preQualify.isDaveBankingEligible && includes(preQualify.daveBankingIncomes, rt.id)) {
      newEvent.isDaveBankingDDEligible = true;
    }
  }

  await newRecurringTransactionEvent.publish(newEvent);
}
