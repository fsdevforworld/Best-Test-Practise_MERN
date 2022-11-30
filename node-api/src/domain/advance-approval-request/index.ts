import { Advance, BankAccount } from '../../models';
import { AdvanceSummary, ApprovalBankAccount } from '../../services/advance-approval/types';
import { moment, Moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Op } from 'sequelize';
import { BankAccount as HeathBankAccount } from '@dave-inc/heath-client';
import * as Bluebird from 'bluebird';
import HeathClient from '../../lib/heath-client';

export async function getApprovalBankAccount(
  bankAccount: BankAccount,
): Promise<ApprovalBankAccount> {
  const bankConnection = await bankAccount.getBankConnection();
  if (!bankConnection) {
    throw new Error('Bank connection not found');
  }
  return {
    id: bankAccount.id,
    bankConnectionId: bankAccount.bankConnectionId,
    accountAge: await BankAccount.getAccountAgeFromBankTransactionsByBankAccountId(bankAccount.id),
    current: bankAccount.current,
    isDaveBanking: bankConnection.isDaveBanking(),
    microDepositComplete: bankAccount.microDepositComplete(),
    hasValidCredentials: bankConnection.hasValidCredentials,
    initialPull: bankConnection.initialPull,
    mainPaycheckRecurringTransactionId: bankAccount.mainPaycheckRecurringTransactionId,
  };
}

export async function getAllPrimaryApprovalBankAccountsFromHeath(
  userId: number,
): Promise<ApprovalBankAccount[]> {
  const bankAccounts = await HeathClient.getPrimaryBankAccounts(userId);
  return Bluebird.map(bankAccounts, serializeHeathResponse);
}

export async function getApprovalBankAccountFromHeath(
  bankAccountId: number,
): Promise<ApprovalBankAccount> {
  const bankAccount = await HeathClient.getBankAccount(bankAccountId);
  return serializeHeathResponse(bankAccount);
}

async function serializeHeathResponse(bankAccount: HeathBankAccount) {
  return {
    id: bankAccount.id,
    bankConnectionId: bankAccount.bankConnectionId,
    accountAge: await BankAccount.getAccountAgeFromBankTransactionsByBankAccountId(bankAccount.id),
    current: bankAccount.current,
    isDaveBanking: bankAccount.isDaveBanking,
    microDepositComplete: bankAccount.microDepositComplete,
    hasValidCredentials: bankAccount.hasValidCredentials,
    initialPull: moment(bankAccount.initialPull),
    mainPaycheckRecurringTransactionId: bankAccount.mainPaycheckRecurringTransactionId,
  };
}

export async function getAdvanceSummary(
  userId: number,
  today: Moment = moment(),
): Promise<AdvanceSummary> {
  const advances = await Advance.findAll({
    where: {
      userId,
      disbursementStatus: [ExternalTransactionStatus.Completed, ExternalTransactionStatus.Pending],
      created: {
        [Op.lte]: today,
      },
    },
  });

  const outstandingAdvance = advances.find(a => a.outstanding > 0);

  return {
    totalAdvancesTaken: advances.length,
    outstandingAdvance: outstandingAdvance && (await outstandingAdvance.serializeAdvanceWithTip()),
  };
}
