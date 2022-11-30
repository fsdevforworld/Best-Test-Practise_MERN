/**
 * For advance disbursal.
 */
import { AdvanceApprovalResult, DecisionCase } from '../types';

export const MINIMUM_APPROVAL_PAYCHECK_AMOUNT = 300; // For underwriting
export const MINIMUM_APPROVAL_PAYCHECK_AMOUNT_DAVE_BANKING = 300; // For underwriting dave banking accounts
export const DAVE_BANKING_DD_ELIGIBILITY_MINIMUM = 200; // Just so BOD users with no income
export const MINIMUM_PAYCHECK_AMOUNT = 200; // For recurring transactions
export const MAX_TINY_MONEY_AMOUNT = 20;

export const DAVE_BANKING_PROGRAM_PAYCHECK_AMOUNT = 500;

export const MAX_STANDARD_ADVANCE_AMOUNT = 100;
export const MAX_DAVE_SPENDING_ADVANCE_AMOUNT = 200;
export const MAX_ADVANCE_AMOUNT = 200;

export const MIN_ACCOUNT_AGE = 60;
export const MIN_AVAILABLE_BALANCE = -75;

export const SOLVENCY_AMOUNT = 450;

export const ONE_HUNDRED_APPROVED_AMOUNTS = [50, 75, 100];
export const NORMAL_ADVANCE_APPROVED_AMOUNTS = ONE_HUNDRED_APPROVED_AMOUNTS;

export const APPROVED_AMOUNTS_BY_MAX_AMOUNT: { [key: number]: number[] } = {
  0: [],
  5: [5],
  10: [5, 10],
  15: [5, 10, 15],
  20: [10, 15, 20],
  25: [5, 15, 25],
  30: [10, 20, 30],
  40: [20, 30, 40],
  50: [20, 40, 50],
  60: [20, 40, 60],
  70: [20, 50, 70],
  75: [25, 50, 75],
  80: [40, 60, 80],
  85: [25, 50, 85],
  90: [30, 60, 90],
  95: [30, 60, 95],
  100: ONE_HUNDRED_APPROVED_AMOUNTS,
  200: [100, 150, 200],
};

export function getApprovedAmountsByMaximumApprovedAmount(maximumAmount: number) {
  return APPROVED_AMOUNTS_BY_MAX_AMOUNT[maximumAmount] || [];
}

export function getFormattedCaseName(nodeCase: DecisionCase<AdvanceApprovalResult>) {
  return nodeCase.name.replace(/^bound /, '');
}

export enum NodeNames {
  AccountAgeFailureMlNode = 'account-age-failure-ml-node',
  AccountAgeFailureModelV2Node = 'account_age_failure_model_v2',
  AccountAgeNode = 'Account Age Node',
  DaveBanking200DollarModel = 'dave_banking_200_dollar_model',
  DaveBanking200DollarModel2DD = 'dave_banking_200_dollar_model_2DD',
  DaveBanking100DollarModel = 'dave_banking_100_dollar_model',
  EligibilityNode = 'Eligibility Node',
  ExistingIncomeTimingNode = 'Existing Income Timing Node',
  GeneralizedFailureModelNode = 'generalized_failure_model_v2',
  GlobalModelV1BigMoneyNode = 'global_model_v1_big_money',
  GlobalModelV1TinyMoneyNode = 'global_model_v1_tiny_money',
  GeneralizedFailureModelNodeV2_1 = 'generalized_failure_model_v2_1',
  GeneralizedFailureModelNodeV2_2 = 'generalized_failure_model_v2_2',
  IncomeSuccessNewUserNode = 'income_success_new_user_node',
  IncomeValidationNode = 'Income Validation Node',
  IncomeValidationNodeV2 = 'income_validation_node_v2',
  IncomeValidationFailureModel = 'ml_node_income_validation_failure_model',
  IncomeValidationFailureGlobalModel100Dollars = 'income_validation_failure_global_model_100_dollars',
  IncomeValidationFailureGlobalModelV1 = 'income_validation_failure_global_model_v1',
  IncomeValidationSuccessGlobalModelV1 = 'income_validation_success_global_model_v1',
  IncomeValidationSuccessGlobalModelV1NewUsers = 'income_validation_success_global_model_v1_new_users',
  IncomeValidationSuccessGlobalModelV1TieredScoreLimits = 'income_validation_success_global_model_v1_tiered_score_limits',
  IncomeValidationSuccessGlobalModelV1TieredScoreLimits100 = 'income_validation_success_global_model_v1_tiered_score_limits_100',
  isDaveBanking = 'is_dave_banking',
  LowIncomeNode = 'low-income-amount',
  MLDidErrorNode = 'ml-did-error-node',
  NewUserNode = 'new_user_node',
  PaydaySolvencyMlOverrideNodeV2 = 'payday_solvency_ml_override_node_v2_1',
  PaydaySolvencyNode = 'Payday Solvency Node',
  TwoDirectDepositNode = 'two_direct_deposit_node',
  UnemploymentBenefitsNode = 'unemployment_benefits_node',
  VariableTinyMoneyMlOverrideNode = 'variable_tiny_money_ml_2019-12-09',

  // new Generation
  AccountAgeFailureGMV1 = 'account_age_failure_gm_v1',
  DaveBankingGMV1 = 'dave_banking_gm_v1',
  IncomeValidationFailureGMV1 = 'income_validation_failure_gm_v1',
  IncomeValidationSuccessGMV1 = 'income_validation_success_gm_v1',
  DaveBankingModelEligibilityNode = 'dave_banking_model_eligibility_node',

  // Underwriting v2 / Overdraft
  AccountAgeFailureUWv2 = 'account_age_failure_uw_v2',
  AccountAgeFailureUWv2_1 = 'account_age_failure_uw_v2_1',
  DaveBankingUWv2 = 'dave_banking_uw_v2',
  DaveBankingUWv2_1 = 'dave_banking_uw_v2_1',
  IncomeValidationSuccessUWv2 = 'income_validation_success_uw_v2',
  IncomeValidationFailureUWv2 = 'income_validation_failure_uw_v2',
}
