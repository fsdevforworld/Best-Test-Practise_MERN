import {
  AdvanceApprovalResponse,
  AdvanceApprovalStatus,
  BankingDataSource,
} from '@dave-inc/wire-typings';
import { Request, Response } from 'express';
import { filter, isEmpty, orderBy, some } from 'lodash';
import { Cache } from '../../../lib/cache';
import { NotFoundError } from '../../../lib/error';
import logger from '../../../lib/logger';
import { BankAccount, User } from '../../../models';
import { IDaveResponse } from '../../../typings';
import { AdvanceApprovalTrigger } from '../../../services/advance-approval/types';
import AdvanceApprovalClient from '../../../lib/advance-approval-client';
import { getTimezone } from '../../../domain/user-setting';
import { getAdvanceSummary } from '../../../domain/advance-approval-request';

// Cache for 36 hours
const APPROVAL_CACHE_LENGTH_SECONDS = 36 * 60 * 60;

export const userAdvanceApprovalStatusCache = new Cache('banking.user_advance_approval_status');

export function getCacheKey(userId: number) {
  return `.user_id:${userId}`;
}

export async function getAdvanceStatus(
  req: Request,
  res: IDaveResponse<AdvanceApprovalResponse>,
): Promise<Response> {
  const daveUserId = parseInt(req.params.id, 10);

  const redisKey = getCacheKey(daveUserId);

  const cachedValue = await userAdvanceApprovalStatusCache.get(redisKey);

  if (cachedValue) {
    return res.send({
      status: cachedValue as AdvanceApprovalStatus,
    });
  }

  const user = await User.findByPk(daveUserId);
  if (!user) {
    throw new NotFoundError();
  }

  const bankAccounts = await BankAccount.getSupportedAccountsByUserId(user.id);

  // only run approvals against non-deleted, non-Dave accounts
  const nonDaveAccounts = filter(
    bankAccounts,
    x => x.bankConnection.bankingDataSource !== BankingDataSource.BankOfDave,
  );

  if (isEmpty(nonDaveAccounts)) {
    logger.warn(
      'Advance approval status for user inconclusive, cannot find an active non-Dave spending account',
    );
    // Log warning, dd metric and return inconclusive
    return res.send({
      status: 'INCONCLUSIVE',
    });
  }

  let bankAccountForApproval;

  if (nonDaveAccounts.length > 1) {
    // if we have multiple candidates, there's a hierarchy of choices
    // first, use the user's default if available
    bankAccountForApproval = nonDaveAccounts.find(x => x.id === user.defaultBankAccountId);

    // if the user's default isn't available in the list (it's their Dave account or was deleted)
    if (!bankAccountForApproval) {
      // start by looking at primary accounts only
      let eligibleAccounts = filter(
        nonDaveAccounts,
        account => account.bankConnection.primaryBankAccountId === account.id,
      );

      // if there's no primary accounts, select from the secondary ones
      if (isEmpty(eligibleAccounts)) {
        eligibleAccounts = nonDaveAccounts;
      }

      // pick the account with the biggest balance
      bankAccountForApproval = orderBy(eligibleAccounts, x => x.available, 'desc')[0];
    }
  } else {
    bankAccountForApproval = nonDaveAccounts[0];
  }

  const results = await AdvanceApprovalClient.createAdvanceApproval({
    userId: user.id,
    userTimezone: await getTimezone(user.id),
    bankAccountId: bankAccountForApproval.id,
    advanceSummary: await getAdvanceSummary(user.id),
    trigger: AdvanceApprovalTrigger.BankingRiskCheck,
    auditLog: false,
  });

  let approvalStatus: AdvanceApprovalStatus = 'REJECTED';

  if (some(results, x => x.approved)) {
    approvalStatus = some(results, x =>
      some(x.approvedAmounts, y => y > AdvanceApprovalClient.MAX_TINY_MONEY_AMOUNT),
    )
      ? 'APPROVED_BIG_MONEY'
      : 'APPROVED_SMALL_MONEY';
  }

  await userAdvanceApprovalStatusCache.set(redisKey, approvalStatus, APPROVAL_CACHE_LENGTH_SECONDS);

  return res.send({
    status: approvalStatus,
  });
}
