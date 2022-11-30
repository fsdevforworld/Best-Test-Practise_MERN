import * as Bluebird from 'bluebird';
import { isEmpty, isNil } from 'lodash';
import { BankTransaction } from '@dave-inc/heath-client';
import { Moment, moment } from '@dave-inc/time-lib';
import { ApprovalBankAccount, UserPreQualifyResponse } from '../types';
import { getRecurringTransactionsEligibleForAdvance } from './';
import { DaveBankingModelEligibilityNode } from './nodes';
import RecurringTransactionClient, { RecurringTransaction } from '../recurring-transaction-client';

type PreQualifyIncome = {
  recurringIncome: RecurringTransaction;
  paychecks: BankTransaction[];
};

type PreQualifyDict = {
  incomes: PreQualifyIncome[];
};

export async function preQualifyUser(
  userId: number,
  bankAccount: ApprovalBankAccount,
): Promise<UserPreQualifyResponse> {
  if (bankAccount.isDaveBanking === true) {
    const preQualifyDict = await buildPreQualifyDict(userId, bankAccount.id);
    const preQualifyDaveBanking = checkDaveBankingEligibility(preQualifyDict);
    return preQualifyDaveBanking;
  } else {
    // for now, no checks for non-Dave banking. Take quick out.
    return {
      isDaveBankingEligible: false,
    };
  }
}

async function buildPreQualifyDict(
  userId: number,
  bankAccountId: number,
  today: Moment = moment(),
): Promise<PreQualifyDict> {
  const recurringTransactions = await getRecurringTransactionsEligibleForAdvance(
    userId,
    bankAccountId,
  );

  const incomes = await Bluebird.map(recurringTransactions, async rt => {
    const previousPaychecks = rt
      ? await RecurringTransactionClient.getMatchingBankTransactions(rt, today)
      : [];
    return {
      recurringIncome: rt,
      paychecks: previousPaychecks,
    };
  });

  return {
    incomes,
  };
}

function checkDaveBankingEligibility(preQualifyDict: PreQualifyDict) {
  const qualifiedIncomes = preQualifyDict.incomes.filter(income => {
    const incomeCheckResult = DaveBankingModelEligibilityNode.performIncomeCheck(
      income.recurringIncome,
      income.paychecks,
    );
    return isNil(incomeCheckResult.checkFailure);
  });

  const isDaveBankingEligible = !isEmpty(qualifiedIncomes);
  const daveBankingIncomes = isDaveBankingEligible
    ? qualifiedIncomes.map(inc => inc.recurringIncome.id)
    : undefined;

  return {
    isDaveBankingEligible,
    daveBankingIncomes,
  };
}
