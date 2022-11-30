import { Request, Response } from 'express';
import {
  DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT,
  getAdvanceApprovalForPaycheck,
  getVagueRuleDescriptions,
  MAX_DAVE_SPENDING_ADVANCE_AMOUNT,
  MAX_STANDARD_ADVANCE_AMOUNT,
  MIN_ACCOUNT_AGE,
  MIN_AVAILABLE_BALANCE,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  preQualifyUser,
  requestAdvances,
  retrieveAdvanceApproval,
  SOLVENCY_AMOUNT,
  retrieveAdvanceApprovalById,
} from '../../../src/services/advance-approval/advance-approval-engine';
import {
  CreateApprovalParams,
  CreateSingleApprovalParams,
  GetPreQualifyParams,
  GetApprovalParams,
  GetRulesParams,
  UpdateExperimentsParams,
} from '../../lib/advance-approval-client';
import { DEFAULT_TIMEZONE, Moment, moment } from '@dave-inc/time-lib';
import { updateAdvanceExperiments } from '../../../src/services/advance-approval/advance-approval-engine/experiments/update-experiments';
import { AdvanceRulesResponse } from '@dave-inc/wire-typings';
import { shouldAuditLog } from './helpers';
import {
  UserPreQualifyResponse,
  ApprovalBankAccount,
  AdvanceApprovalCreateResponse,
} from './types';
import { DaveBankingModelEligibilityNode } from './advance-approval-engine/nodes';
import {
  getAllPrimaryApprovalBankAccountsFromHeath,
  getApprovalBankAccountFromHeath,
  getAdvanceSummary as getAdvanceSummaryDomain,
} from '../../domain/advance-approval-request';
import { serializeAdvanceApproval } from './serializer';
import { InvalidParametersError, NotFoundError } from '@dave-inc/error-types';
import { isNil } from 'lodash';

export const TRUE_VALUE = 'true';

export async function createApproval(req: Request, res: Response) {
  const {
    bankAccountId,
    advanceSummary,
    userId,
    appScreen,
    trigger,
    auditLog,
    mlUseCacheOnly,
    userTimezone,
    useAllBankAccounts,
  } = req.body;

  const approvalResponses = await handleCreateApproval({
    bankAccountId,
    advanceSummary,
    userId,
    appScreen,
    trigger,
    auditLog,
    mlUseCacheOnly,
    userTimezone,
    useAllBankAccounts,
  });

  res.send(approvalResponses);
}

export async function handleCreateApproval({
  bankAccountId,
  advanceSummary,
  userId,
  appScreen,
  trigger,
  auditLog,
  mlUseCacheOnly,
  useAllBankAccounts = false,
  userTimezone = DEFAULT_TIMEZONE,
}: CreateApprovalParams): Promise<AdvanceApprovalCreateResponse[]> {
  const isAuditLog = shouldAuditLog(appScreen, auditLog);
  if (!useAllBankAccounts && !bankAccountId) {
    throw new InvalidParametersError(
      'bankAccountId is Required if not useAllBankAccounts is false',
    );
  }

  let bankAccounts: ApprovalBankAccount[];
  try {
    bankAccounts = useAllBankAccounts
      ? await getAllPrimaryApprovalBankAccountsFromHeath(userId)
      : [await getApprovalBankAccountFromHeath(bankAccountId)];
  } catch (error) {
    if (error.code === 404) {
      throw new NotFoundError('Bank Account Not Found');
    }
    throw error;
  }

  return requestAdvances(
    userId,
    bankAccounts,
    advanceSummary,
    trigger,
    userTimezone,
    {
      isAdmin: false,
      auditLog: isAuditLog,
      mlUseCacheOnly,
    },
    { appScreen },
  );
}

export async function createSingleApproval(req: Request, res: Response) {
  const { userId, bankAccountId, trigger, userTimezone, advanceSummary } = req.body;
  const { recurringTransactionId } = req.params;
  const approval = await handleCreateSingleApproval({
    recurringTransactionId: parseInt(recurringTransactionId, 10),
    advanceSummary,
    userId,
    bankAccountId,
    trigger,
    userTimezone,
  });

  res.send(approval);
}

export async function handleCreateSingleApproval({
  recurringTransactionId,
  userId,
  bankAccountId,
  advanceSummary,
  trigger,
  userTimezone = DEFAULT_TIMEZONE,
}: CreateSingleApprovalParams) {
  return getAdvanceApprovalForPaycheck(
    recurringTransactionId,
    userId,
    await getApprovalBankAccountFromHeath(bankAccountId),
    advanceSummary,
    trigger,
    userTimezone,
  );
}

export async function getPreQualify(req: Request, res: Response) {
  const { userId, bankAccount } = req.body;
  const preApproval = await handlePreQualifyUser({ userId, bankAccount });
  return res.send(preApproval);
}

export async function handlePreQualifyUser({
  userId,
  bankAccount,
}: GetPreQualifyParams): Promise<UserPreQualifyResponse> {
  return preQualifyUser(userId, bankAccount);
}

export async function getApproval(req: Request, res: Response) {
  const { bankAccountId, recurringTransactionId, amount } = req.query;
  const advanceApproval = await handleGetApproval({
    bankAccountId: parseInt(bankAccountId, 10),
    recurringTransactionId: parseInt(recurringTransactionId, 10),
    amount: parseInt(amount, 10),
  });
  return res.send(advanceApproval);
}

export async function handleGetApproval({
  bankAccountId,
  recurringTransactionId,
  amount,
}: GetApprovalParams) {
  const approval = await retrieveAdvanceApproval(bankAccountId, amount, recurringTransactionId);

  return serializeAdvanceApproval(approval);
}

export async function getApprovalById(req: Request, res: Response) {
  const { approvalId } = req.params;
  const advanceApproval = await retrieveAdvanceApprovalById(approvalId);

  const response = serializeAdvanceApproval(advanceApproval);

  return res.send(response);
}

export async function getRules(req: Request, res: Response) {
  const { isDaveBanking } = req.query;
  const advanceApproval = await handleGetRules({
    isDaveBanking: isDaveBanking === TRUE_VALUE,
  });
  return res.send(advanceApproval);
}

export async function handleGetRules({ isDaveBanking }: GetRulesParams) {
  const minAvgPaycheckAmount = isDaveBanking
    ? DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT
    : MINIMUM_APPROVAL_PAYCHECK_AMOUNT;

  const advanceRules: AdvanceRulesResponse = {
    maxAdvanceAmount: {
      daveSpending: MAX_DAVE_SPENDING_ADVANCE_AMOUNT,
      externalAccount: MAX_STANDARD_ADVANCE_AMOUNT,
    },
    minAccountAge: MIN_ACCOUNT_AGE,
    minAvailableBalance: MIN_AVAILABLE_BALANCE,
    minAvgPaycheckAmount,
    minDaveBankingMonthlyDD: DaveBankingModelEligibilityNode.MonthlyIncomeMinimum,
    solvencyAmount: SOLVENCY_AMOUNT,
    descriptions: getVagueRuleDescriptions(),
  };

  return advanceRules;
}

export async function updateExperiments(req: Request, res: Response) {
  const { advanceId, advanceApprovalId } = req.body;
  await handleUpdateExperiments({ advanceApprovalId, advanceId });
  res.send({ ok: true });
}

export async function handleUpdateExperiments(data: UpdateExperimentsParams) {
  return updateAdvanceExperiments(data);
}

export async function getAdvanceSummary(req: Request, res: Response) {
  const { userId, today } = req.body;

  if (isNil(userId)) {
    throw new InvalidParametersError('userId is required');
  }

  let todayParsed: Moment = undefined;
  if (!isNil(today)) {
    todayParsed = moment(today);

    if (!todayParsed.isValid()) {
      throw new InvalidParametersError('today is not a properly formatted date string');
    }
  }

  const summary = await getAdvanceSummaryDomain(userId, todayParsed);

  res.send(summary);
}
