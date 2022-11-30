export enum ABTestingEventName {
  BucketedIntoPlaidBankConnectionSourceExperiment = 'BUCKETED_INTO_PLAID_BANK_CONNECTION_SOURCE_EXPERIMENT',
  BucketedIntoMxBankConnectionSourceExperiment = 'BUCKETED_INTO_MX_BANK_CONNECTION_SOURCE_EXPERIMENT',
  BlindCollectNoOverdraftAccount = 'BLIND_COLLECT_NO_OVERDRAFT_ACCOUNT',
  FiveDollarBalanceCollectionExperiment = 'FIVE_DOLLAR_BALANCE_COLLECTION_EXPERIMENT',
  SkipBlindCollectNoOverdraftAccount = 'SKIP_BLIND_COLLECT_NO_OVERDRAFT_ACCOUNT',
  CollectAdvanceAfterTwoDaysExperiment = 'COLLECT_ADVANCE_AFTER_TWO_DAYS_EXPERIMENT_GROUP',
  CollectAdvanceAfterTwoDaysControl = 'COLLECT_ADVANCE_AFTER_TWO_DAYS_CONTROL_GROUP',
  TabapayAVSExperiment = 'TABAPAY_AVS',
}
