export {
  PaybackDateBatchScoreResponse,
  UnderwritingModelScoreResponse,
} from '@dave-inc/oracle-client';

export enum UnderwritingModelType {
  AccountAgeFailureModelV2 = 'account_age_failure_model_v2',
  GlobalModelRandomSample = 'global_model_random_sample',
  GeneralizedFailureModelV2 = 'generalized_failure_model_v2',
  SolvencyFailureModelV2 = 'solvency_failure_model_v2',
  SixtyDayModel = 'sixty_day_model',
  VariableTinyMoneyModel = 'variable_tiny_money_model',
  IncomeValidationFailureModel = 'income_validation_failure_model',

  // UWv2 / Overdraft launch model
  GlobalModelV2 = 'global_model_v2',
}

export enum PaybackDateModelType {
  PredictedPaybackDateModel = 'predicted_payback_date_model',
}
