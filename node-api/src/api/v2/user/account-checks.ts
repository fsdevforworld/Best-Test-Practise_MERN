import * as Bluebird from 'bluebird';
import { flatMap } from 'lodash';
import { UserAccountChecks } from '@dave-inc/wire-typings';
import { getApprovalBankAccount } from '../../../domain/advance-approval-request';
import UserHelper from '../../../helper/user';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';
import { BankAccount } from '../../../models';
import { UserPreQualifyResponse } from '../../../services/advance-approval/types';

export async function performUserAccountChecks(userId: number): Promise<UserAccountChecks> {
  const bankAccounts = await UserHelper.getAllPrimaryBankAccounts(userId);
  const preQuals = await preQualifications(bankAccounts);

  // TODO: when underwriting service formally splits and this becomes a network call,
  // we can fold more advance rules into this call and save a network request
  const advanceRules = await AdvanceApprovalClient.getRules({ isDaveBanking: true });

  const daveBankingChecks = {
    hasQualifiedDD: preQuals.some(pq => pq.isDaveBankingEligible),
    qualifiedIncomes: flatMap(preQuals, 'daveBankingIncomes'),
    minimumMonthlyDDAmount: advanceRules.minDaveBankingMonthlyDD,
  };

  return {
    daveBankingMemberProgram: daveBankingChecks,
  };
}

async function preQualifications(bankAccounts: BankAccount[]): Promise<UserPreQualifyResponse[]> {
  return Bluebird.map(bankAccounts, async ba => {
    return AdvanceApprovalClient.preQualifyUser({
      userId: ba.userId,
      bankAccount: await getApprovalBankAccount(ba),
    });
  });
}
