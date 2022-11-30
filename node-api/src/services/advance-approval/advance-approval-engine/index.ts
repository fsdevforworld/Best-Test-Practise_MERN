import { DEFAULT_TIMEZONE, Moment, moment } from '@dave-inc/time-lib';
import { AdvanceType, RecurringTransactionStatus } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { flatten, get, isNil, keyBy, max, orderBy } from 'lodash';
import { Op } from 'sequelize';
import { ApprovalNotFoundError, InvalidParametersError } from '../../../lib/error';
import * as Solvency from './solvency';
import { AdminPaycheckOverride, AdvanceApproval } from '../../../models';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalResult,
  AdvanceApprovalTrigger,
  AdvanceRequestAuditLogExtra,
  AdvanceSummary,
  ApprovalBankAccount,
  ApprovalDict,
} from '../types';
import * as ApprovalEngine from './build-engine';
import { MAX_TINY_MONEY_AMOUNT } from './common';
import { LowIncomeNode } from './nodes';
import { addRuleDescriptions } from './rule-descriptions';
import RecurringTransactionClient, { RecurringTransaction } from '../recurring-transaction-client';
import { TransactionType } from '../../../typings';
import * as DataEngine from '../data-engine';

export {
  getFormattedCaseName,
  MAX_STANDARD_ADVANCE_AMOUNT,
  MAX_DAVE_SPENDING_ADVANCE_AMOUNT,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT_DAVE_BANKING,
  MINIMUM_PAYCHECK_AMOUNT,
  MIN_ACCOUNT_AGE,
  MIN_AVAILABLE_BALANCE,
  NORMAL_ADVANCE_APPROVED_AMOUNTS,
  ONE_HUNDRED_APPROVED_AMOUNTS,
  DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT,
  SOLVENCY_AMOUNT,
} from './common';
export { preQualifyUser } from './pre-qualify';
export { addRuleDescriptions, getVagueRuleDescriptions } from './rule-descriptions';

export type RequestAdvanceParams = {
  today?: Moment;
  isAdmin?: boolean;
  auditLog?: boolean;
  mlUseCacheOnly?: boolean;
};

type getSortedAdvanceApprovalResponsesParams = {
  bankAccount: ApprovalBankAccount;
  advanceSummary: AdvanceSummary;
  logData?: any;
  recurringTransactions: RecurringTransaction[];
  requestAdvanceParams?: RequestAdvanceParams;
  trigger: AdvanceApprovalTrigger;
  userId: number;
  userTimezone: string;
};

async function getAdvanceApprovalResponses({
  bankAccount,
  advanceSummary,
  logData,
  recurringTransactions,
  requestAdvanceParams,
  trigger,
  userId,
  userTimezone,
}: getSortedAdvanceApprovalResponsesParams): Promise<AdvanceApprovalCreateResponse[]> {
  const advanceApprovalEngine = ApprovalEngine.buildAdvanceApprovalEngine();

  const groupToken = Math.random()
    .toString(36)
    .substring(2, 10);
  const groupedAt = moment();
  return Bluebird.map(recurringTransactions, async recurTrans => {
    const approvalDict = await buildApprovalDict(
      userId,
      bankAccount,
      advanceSummary,
      recurTrans,
      trigger,
      userTimezone,
      requestAdvanceParams,
    );
    const defaultResponse = getDefaultApprovalResult(approvalDict, logData);
    defaultResponse.advanceApproval = await saveApprovalPlaceholder(
      approvalDict,
      groupToken,
      groupedAt,
    );
    const result = await advanceApprovalEngine.evaluate(approvalDict, defaultResponse);

    return serializeApprovalResponse(result, approvalDict);
  });
}

/**
 * Runs approval for a users bank account. Will return approval
 * responses for all paychecks that are eligible for advances.
 */
export async function requestAdvances(
  userId: number,
  bankAccounts: ApprovalBankAccount[],
  advanceSummary: AdvanceSummary,
  trigger: AdvanceApprovalTrigger,
  userTimezone: string,
  requestAdvanceParams?: RequestAdvanceParams,
  logData?: any,
): Promise<AdvanceApprovalCreateResponse[]> {
  const batchedApprovals = await Bluebird.map(bankAccounts, async bankAccount => {
    const recurringTransactions = await getRecurringTransactionsEligibleForAdvance(
      userId,
      bankAccount.id,
    );

    if (!recurringTransactions.length) {
      recurringTransactions.push(null);
    }

    return getAdvanceApprovalResponses({
      bankAccount,
      advanceSummary,
      logData,
      recurringTransactions,
      requestAdvanceParams,
      trigger,
      userId,
      userTimezone,
    });
  });

  const approvals: AdvanceApprovalCreateResponse[] = flatten(batchedApprovals);

  const sortedApprovalResponses = await sortApprovalResponses(bankAccounts, approvals);

  if (requestAdvanceParams && requestAdvanceParams.auditLog) {
    await saveApprovalResults(sortedApprovalResponses);
  }

  await DataEngine.publishApprovalEvents(userId, sortedApprovalResponses);

  return sortedApprovalResponses;
}

/**
 * Resource-efficient way of getting multiple advance approvals at once.
 */
export async function getAdvanceApprovalForPaycheck(
  recurringTransactionId: number,
  userId: number,
  bankAccount: ApprovalBankAccount,
  advanceSummary: AdvanceSummary,
  trigger: AdvanceApprovalTrigger,
  userTimezone: string,
): Promise<AdvanceApprovalCreateResponse> {
  const transaction = await RecurringTransactionClient.getById(recurringTransactionId);
  if (!transaction) {
    throw new InvalidParametersError('Recurring transaction not found.');
  }

  if (transaction.type === TransactionType.EXPENSE) {
    return;
  }

  const approvalDict = await buildApprovalDict(
    userId,
    bankAccount,
    advanceSummary,
    transaction,
    trigger,
    userTimezone,
  );

  const advanceApprovalEngine = ApprovalEngine.buildAdvanceApprovalEngine();

  const defaultApprovalResponse = getDefaultApprovalResult(approvalDict, {});
  const results = await advanceApprovalEngine.evaluate(approvalDict, defaultApprovalResponse);

  return serializeApprovalResponse(results, approvalDict);
}

export function serializeApprovalResponse(
  approvalResult: AdvanceApprovalResult,
  dict: ApprovalDict,
): AdvanceApprovalCreateResponse {
  const maxApprovedAmount = max(approvalResult.approvedAmounts);
  const approved = maxApprovedAmount > 0;
  const microAdvanceApproved = maxApprovedAmount <= MAX_TINY_MONEY_AMOUNT;
  const normalAdvanceApproved = maxApprovedAmount > MAX_TINY_MONEY_AMOUNT;

  const advanceApproval = approvalResult.advanceApproval;
  const now = moment();
  // created on advanceApproval is supposedly a moment object, but it seems to actually be a Date
  const created = isNil(advanceApproval) ? now : moment(advanceApproval.created);

  let expired: boolean;
  let expiresAt: Moment;

  if (!isNil(advanceApproval)) {
    expiresAt = created.add(1, 'day');
    expired = created.isBefore(expiresAt);
  }

  return {
    id: approvalResult.advanceApproval?.id,
    bankAccountId: approvalResult.bankAccountId,
    userId: approvalResult.userId,
    paycheckDisplayName: approvalResult.expected?.displayName,
    approved,
    defaultPaybackDate: moment(approvalResult.defaultPaybackDate).ymd(),
    primaryRejectionReason: approved ? null : approvalResult.rejectionReasons?.[0],
    microAdvanceApproved,
    normalAdvanceApproved,
    advanceType: microAdvanceApproved ? AdvanceType.microAdvance : AdvanceType.normalAdvance,
    approvedAmounts: approvalResult.approvedAmounts,
    caseResolutionStatus: approvalResult.caseResolutionStatus,
    recurringTransactionId: approvalResult.recurringTransactionId,
    recurringTransactionUuid: approvalResult.recurringTransactionUuid,
    expectedTransactionId: approvalResult?.expected?.id,
    expectedTransactionUuid: approvalResult?.expected?.groundhogId,
    isExperimental: approvalResult.isExperimental,
    rejectionReasons: approvalResult.rejectionReasons,
    incomeValid: approvalResult.incomeValid,
    advanceEngineRuleDescriptions: addRuleDescriptions(approvalResult.caseResolutionStatus, dict),
    extra: approvalResult.extra,
    created: now.format(),
    expired,
    expiresAt: expiresAt?.format(),
  };
}

/**
 * Finds and validates advance approval from /terms endpoint call.
 */
export async function retrieveAdvanceApproval(
  bankAccountId: number,
  amount: number,
  recurringTransactionId: number = null,
): Promise<AdvanceApproval> {
  if (recurringTransactionId) {
    const recurringTransaction = await RecurringTransactionClient.getById(recurringTransactionId);
    if (!recurringTransaction || recurringTransaction.bankAccountId !== bankAccountId) {
      throw new ApprovalNotFoundError('Recurring Transaction not found');
    }
  }

  // Find matching advance approval
  const advanceApprovals = await AdvanceApproval.findAll({
    order: [['created', 'DESC']],
    where: {
      bankAccountId,
      created: {
        [Op.gt]: moment().subtract(1, 'hour'),
      },
    },
  });
  let advanceApproval: AdvanceApproval;
  if (recurringTransactionId) {
    advanceApproval = advanceApprovals.find(
      aa => aa.recurringTransactionId === recurringTransactionId,
    );
  } else {
    // Older app versions will not include the recurring transaction id
    advanceApproval = advanceApprovals.find(aa => advanceAmountIsValid(amount, aa));
  }

  if (!advanceApproval) {
    throw new ApprovalNotFoundError();
  }

  if (!advanceAmountIsValid(amount, advanceApproval)) {
    throw new ApprovalNotFoundError();
  }

  return advanceApproval;
}

/**
 * Finds and validates advance approval by id
 */
export async function retrieveAdvanceApprovalById(
  advanceApprovalId: number,
): Promise<AdvanceApproval> {
  // Find matching advance approval
  const advanceApproval = await AdvanceApproval.findOne({
    where: {
      id: advanceApprovalId,
    },
  });

  if (!advanceApproval) {
    throw new ApprovalNotFoundError();
  }

  return advanceApproval;
}

function sortApprovalResponses(
  bankAccounts: ApprovalBankAccount[],
  approvalResponses: AdvanceApprovalCreateResponse[],
): AdvanceApprovalCreateResponse[] {
  // sort by amount first
  // then sort winning amounts by putting dave banking first
  // then if still matches put the main paycheck first
  const bankAccountDict = keyBy(bankAccounts, 'id');
  return orderBy(
    approvalResponses,
    [
      (a: AdvanceApprovalCreateResponse) => max(a.approvedAmounts) || 0,
      (a: AdvanceApprovalCreateResponse) => bankAccountDict[a.bankAccountId].isDaveBanking,
      (a: AdvanceApprovalCreateResponse) =>
        bankAccountDict[a.bankAccountId].mainPaycheckRecurringTransactionId ===
        a.recurringTransactionId,
    ],
    ['desc', 'desc', 'desc'],
  );
}

export async function saveApprovalPlaceholder(
  dict: ApprovalDict,
  groupToken: string = Math.random()
    .toString(36)
    .substring(2, 10),
  groupedAt: Moment = moment(),
): Promise<AdvanceApproval> {
  if (dict.auditLog) {
    const advanceApproval = await AdvanceApproval.create({
      groupedAt,
      groupToken,
      userId: dict.userId,
      bankAccountId: dict.bankAccount.id,
    });
    dict.approvalId = advanceApproval.id;
    return advanceApproval;
  }
}

export async function buildApprovalDict(
  userId: number,
  bankAccount: ApprovalBankAccount,
  advanceSummary: AdvanceSummary,
  rt: RecurringTransaction,
  trigger: AdvanceApprovalTrigger,
  userTimezone: string = DEFAULT_TIMEZONE,
  {
    today = moment(),
    isAdmin = false,
    auditLog = false,
    mlUseCacheOnly = false,
  }: RequestAdvanceParams = {},
): Promise<ApprovalDict> {
  const yesterday = moment(today)
    .tz(userTimezone)
    .subtract(1, 'days');

  const incomeOverride = AdminPaycheckOverride.getNextPaycheckOverrideForAccount(
    bankAccount.id,
    today,
  );

  const previousPaychecks = rt
    ? await RecurringTransactionClient.getMatchingBankTransactions(rt, today)
    : [];

  return Bluebird.props({
    expectedPaycheck:
      rt &&
      RecurringTransactionClient.getNextExpectedTransaction({
        recurringTransactionId: rt.id,
        after: yesterday,
      }),
    previousPaychecks,
    recurringIncome: rt,
    incomeOverride,
    advanceSummary,
    advanceApprovalTrigger: trigger,
    today,
    userId,
    accountAgeDays: bankAccount.accountAge,
    bankAccount,
    isAdmin,
    auditLog,
    mlUseCacheOnly,
    userTimezone,
    incomeAmountAverage: LowIncomeNode.getIncomeAmountAverage(previousPaychecks),
    lastPaycheckAccountBalance: Solvency.lastPaycheckTwoDayMaxAccountBalance(
      bankAccount.id,
      previousPaychecks[0],
    ),
  });
}

export function getDefaultApprovalResult(
  approvalDict: ApprovalDict,
  extraLogData?: any,
): AdvanceApprovalResult {
  const { bankAccount, incomeOverride, expectedPaycheck } = approvalDict;
  const extra: AdvanceRequestAuditLogExtra = {
    mainPaycheckId: bankAccount.mainPaycheckRecurringTransactionId,
    override: incomeOverride,
    lastPaycheckAccountBalance: approvalDict.lastPaycheckAccountBalance,
    incomeAmountAverage: approvalDict.incomeAmountAverage,
    experiments: {
      daysUntilNextPaycheck: 11,
    },
    ...extraLogData,
  };
  return {
    advanceApproval: null,
    userId: approvalDict.userId,
    bankAccountId: approvalDict.bankAccount.id,
    approvedAmounts: [],
    rejectionReasons: [],
    defaultPaybackDate: getDefaultPaybackDate(approvalDict),
    recurringTransactionId: get(approvalDict.recurringIncome, 'id', null),
    recurringTransactionUuid: get(approvalDict.recurringIncome, 'groundhogId', null),
    expected: expectedPaycheck,
    isExperimental: false,
    caseResolutionStatus: {},
    approvalDict,
    extra,
  };
}

/**
 * Finds all recurring transaction that are eligible for an advance, given a user and bank account id
 *
 * @param {number} userId
 * @param {number} bankAccountId
 * @returns {Promise<RecurringTransaction[]>}
 */
export async function getRecurringTransactionsEligibleForAdvance(
  userId: number,
  bankAccountId: number,
): Promise<RecurringTransaction[]> {
  return RecurringTransactionClient.getIncomes({
    userId,
    bankAccountId,
    status: [
      RecurringTransactionStatus.VALID,
      RecurringTransactionStatus.INVALID_NAME,
      RecurringTransactionStatus.SINGLE_OBSERVATION,
    ],
  });
}

export function advanceAmountIsValid(amount: number, approvalResponse: AdvanceApproval): boolean {
  return amount <= Math.max(...approvalResponse.approvedAmounts);
}

/**
 * ApprovalResults are saved into AdvanceApproval rows in the database.
 */
export async function saveApprovalResults(
  approvalResponses: AdvanceApprovalCreateResponse[],
): Promise<void> {
  await Bluebird.map(approvalResponses, (approvalResponse, index) => {
    const isPreferred = index === 0;
    return saveAdvanceApproval(approvalResponse, isPreferred);
  });
}

export async function saveAdvanceApproval(
  approvalResponse: AdvanceApprovalCreateResponse,
  isPreferred: boolean,
) {
  if (approvalResponse.id) {
    await AdvanceApproval.update(
      {
        isPreferred,
        userId: approvalResponse.userId,
        bankAccountId: approvalResponse.bankAccountId,
        approved: approvalResponse.approved,
        normalAdvanceApproved: approvalResponse.normalAdvanceApproved,
        microAdvanceApproved: approvalResponse.microAdvanceApproved,
        approvedAmounts: approvalResponse.approvedAmounts,
        rejectionReasons: approvalResponse.rejectionReasons,
        extra: approvalResponse.extra,
        primaryRejectionReason: get(approvalResponse.primaryRejectionReason, 'type'),
        expectedTransactionId: approvalResponse.expectedTransactionId,
        expectedTransactionUuid: approvalResponse.expectedTransactionUuid,
        defaultPaybackDate: approvalResponse.defaultPaybackDate,
        recurringTransactionId: approvalResponse.recurringTransactionId,
        recurringTransactionUuid: approvalResponse.recurringTransactionUuid,
      },
      { where: { id: approvalResponse.id } },
    );
  }
}

export function getDefaultPaybackDate(approvalDict: ApprovalDict) {
  if (approvalDict.incomeOverride) {
    return approvalDict.incomeOverride.payDate;
  } else if (approvalDict.expectedPaycheck) {
    return moment(approvalDict.expectedPaycheck.expectedDate);
  }

  return getExpectedDateForNoIncome(approvalDict.today);
}

export function getExpectedDateForNoIncome(today: Moment): Moment {
  const expectedDate = moment(today);
  // Sunday & Monday its due Friday otherwise its due next week Friday
  if (expectedDate.isoWeekday() < 2) {
    expectedDate.isoWeekday(5);
  } else {
    expectedDate.add(1, 'weeks').isoWeekday(5);
  }
  return expectedDate;
}
