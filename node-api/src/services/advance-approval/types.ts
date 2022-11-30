import { BankTransaction } from '@dave-inc/heath-client';
import { AdvanceResponse, AdvanceType } from '@dave-inc/wire-typings';
import { Moment } from 'moment';
import { ExpectedTransaction, RecurringTransaction } from './recurring-transaction-client';
import { AdminPaycheckOverride, AdvanceApproval } from '../../models';
import { NodeNames } from './advance-approval-engine/common';
import { IOracleConfig, PaybackDateModelType, UnderwritingModelType } from '../../lib/oracle';

export type ApprovalBankAccount = {
  current: number;
  id: number;
  bankConnectionId: number;
  accountAge: number;
  microDepositComplete: boolean;
  hasValidCredentials: boolean;
  initialPull: Moment;
  isDaveBanking: boolean;
  mainPaycheckRecurringTransactionId: number;
};

export type AdvanceSummary = {
  totalAdvancesTaken: number;
  outstandingAdvance?: AdvanceResponse;
};

/**
 * Can affect thresholds for limiters on experiments.
 */
export enum AdvanceApprovalTrigger {
  Admin = 'ADMIN',
  BodInsufficientFundsTransaction = 'BOD_INSUFFICIENT_FUNDS_TRANSACTION',
  GetPaychecks = 'GET_PAYCHECKS',
  PreApproval = 'PRE_APPROVAL',
  UserTerms = 'USER_TERMS',
  UserRequest = 'USER_REQUEST',
  MachineLearningEligibility = 'MACHINE_LEARNING_ELIGIBILITY',
  BankingRiskCheck = 'BANKING_RISK_CHECK',
}

export type DecisionCaseError = {
  type: string;
  message: string;
  extra?: any;
  path?: string;
  status?: string;
  displayMessage?: string;
};

export enum DecisionNodeType {
  Static = 'STATIC',
  MachineLearning = 'MACHINE_LEARNING',
}

export interface IDecisionCaseResponse<T, D = any> {
  error?: DecisionCaseError;
  updates?: Partial<T>;
  logData?: D;
}

export type EngineEvent = {
  type: string;
  params: {
    displayMessage?: string;
    extra?: any;
    message?: string;
    path?: string;
    status?: string;
  };
};

export type ApprovalDict = {
  approvalId?: number;
  userId: number;
  bankAccount: ApprovalBankAccount;
  isAdmin: boolean;
  expectedPaycheck: ExpectedTransaction;
  previousPaychecks: BankTransaction[];
  recurringIncome: RecurringTransaction;
  incomeOverride: AdminPaycheckOverride;
  advanceApprovalTrigger: AdvanceApprovalTrigger;
  today: Moment;
  advanceSummary: AdvanceSummary;
  auditLog: boolean;
  accountAgeDays: number;
  mlUseCacheOnly?: boolean;
  userTimezone: string;
  incomeAmountAverage: number;
  lastPaycheckAccountBalance: number;
};

export type DecisionCase<T> = (
  dict: Partial<ApprovalDict>,
  prev: T,
  previousNodeUpdates?: Partial<T>,
) => Promise<void | IDecisionCaseResponse<T>> | IDecisionCaseResponse<T>;

export type CaseResolutionStatusDict = {
  [caseName: string]: boolean;
};

export type AdvanceApprovalResult = {
  userId: number;
  bankAccountId: number;
  approvedAmounts?: number[];
  advanceType?: AdvanceType;
  mlDidError?: boolean;
  rejectionReasons: DecisionCaseError[];
  extra?: Partial<AdvanceRequestAuditLogExtra>;
  recurringTransactionId?: number;
  recurringTransactionUuid?: string;
  expected?: Partial<ExpectedTransaction>;
  defaultPaybackDate: Moment;
  isExperimental: boolean;
  caseResolutionStatus: CaseResolutionStatusDict;
  incomeValid?: boolean;
  advanceApproval: AdvanceApproval;
  approvalDict?: ApprovalDict;
};

export type NodeRuleDescriptionInfo = {
  matchingCases: string[];
  explicitDescription: string;
  vagueDescription: string;
  nodeName: NodeNames;
  // We need to identify some as being the first node we handle failures differently it is associated with the first node
  isFirstNode?: boolean;
};

export type AdvanceEngineRuleDescription = {
  passed: string[];
  failed: string[];
  pending: string[];
};

export type AdvanceApprovalCreateResponse = {
  id: number;
  bankAccountId: number;
  userId: number;
  approvedAmounts: number[];
  defaultPaybackDate: string;
  incomeValid: boolean;
  approved: boolean;
  created: string;
  caseResolutionStatus: CaseResolutionStatusDict;
  recurringTransactionId?: number;
  recurringTransactionUuid?: string;
  expectedTransactionId?: number;
  expectedTransactionUuid?: string;
  isExperimental: boolean;
  advanceType: AdvanceType;
  primaryRejectionReason?: DecisionCaseError;
  rejectionReasons: DecisionCaseError[];
  normalAdvanceApproved?: boolean;
  microAdvanceApproved?: boolean;
  paycheckDisplayName: string;
  advanceEngineRuleDescriptions?: AdvanceEngineRuleDescription;
  extra?: Partial<AdvanceRequestAuditLogExtra>;
  expired?: boolean;
  expiresAt?: string;
};

export type AdvanceApprovalGetResponse = {
  id: number;
  bankAccountId: number;
  userId: number;
  approvedAmounts: number[];
  defaultPaybackDate: string;
  approved: boolean;
  created: string;
  recurringTransactionId?: number;
  recurringTransactionUuid?: string;
  expectedTransactionId?: string;
  expectedTransactionUuid?: string;
  primaryRejectionReason?: string;
  normalAdvanceApproved?: boolean;
  microAdvanceApproved?: boolean;
  expired: boolean;
  expiresAt: string;
};

export type UserPreQualifyResponse = {
  isDaveBankingEligible: boolean;
  daveBankingIncomes?: number[];
};

export type AdvanceRequestAuditLogExtra = {
  override?: boolean;
  mainPaycheckId: number;
  passedAdminOverridePaybackCheck: boolean;
  skippedSolvency: boolean;
  gigEconomyIncomeNodePassed: boolean;
  paidBack5AdvancesNodePassed: boolean;
  lowerSolvencyNodePassed: boolean;
  solvencyAmount: number;
  hasGigEconomyIncome: boolean;
  nextBusinessDaySolvencyNodePassed: boolean;
  daysAboveBalanceThreshold?: number;
  paychecks: BankTransaction[];
  appScreen: string;
  isSecondaryPaycheck: boolean;
  lastPaycheckAccountBalance: number;
  solvencyOverrideMlResponse: any;
  mlSolvencyOverridePassed: boolean;
  bankOfDaveBypass: boolean;
  gigIncomesDisplayNames: string[];
  incomeAmountAverage: number;
  unemploymentBenefitTransaction?: {
    id: number;
    date: string;
  };
  experiments: {
    [name: string]: any;
  };
  variables: {
    approveInvalidOrMissingIncome: boolean;
    daysUntilNextPaycheck: number;
    debitPaymentDaysThreshold: number;
    achPaymentDaysThreshold: number;
    lowerSolvencyAmountTest: boolean;
  };
};

/**
 *  Oracle Models
 *
 *  Outsources ML models to https://github.com/dave-inc/oracle
 */

export enum UnderwritingModelConfigKey {
  // global model
  AccountAgeFailureGMV1 = 'accountAgeFailureGMV1',
  DaveBankingGMV1 = 'daveBankingGMV1',
  IncomeValidationFailureGMV1 = 'incomeValidationFailureGMV1',
  IncomeValidationSuccessGMV1 = 'incomeValidationSuccessGMV1',

  // underwriting v2 / overdraft
  AccountAgeFailureUWv2 = 'accountAgeFailureUWv2',
  DaveBankingUWv2 = 'daveBankingUWv2',
  IncomeValidationFailureUWv2 = 'incomeValidationFailureUWv2',
  IncomeValidationSuccessUWv2 = 'incomeValidationSuccessUWv2',
}

export type UnderwritingMlConfig = {
  experiment?: {
    active?: boolean;
    ratio?: number;
    limit?: number;
  };
  modelType: UnderwritingModelType;
  scoreLimits: ScoreLimitConfig;
  oracle: IOracleConfig;
};

export type UnderwritingScoreLimits = { [stringAmount: string]: number };
export type DynamicScoreLimits = {
  [stringAmount: string]: UnderwritingScoreLimits;
};
export const CalculatedScore = 'calculated';
export type ScoreLimitConfig = UnderwritingScoreLimits | DynamicScoreLimits | 'calculated';

export type PredictedPaybackMlConfig = {
  modelType: PaybackDateModelType;
  generalModelUrl: string;
  scoreLimit: number;
  oracle: IOracleConfig;
  enabled: string | boolean;
};

export type UnderwritingModelParams = {
  userId: number;
  bankAccountId: number;
  paybackDate: Moment;
  modelType: UnderwritingModelType;
  cacheOnly?: boolean;
};
