export enum CollectionFailures {
  BalanceTooLow = 'Balance too low to attempt collection',
  TimeOutsideACHCollection = 'Time outside ACH collection window',
}

export enum SubscriptionChargeType {
  None = 'N/A',
  DebitAndBankNextDayAch = 'debit charge & bank charge & is eligible for next day ACH',
  DebitAndBankSameDayAch = 'debit charge & bank charge & balance > 10',
  DebitChargeOnly = 'debit charge only',
  BankChargeOnlyNextDayAch = 'bank charge only (next day)',
  BankChargeOnly = 'bank charge only',
  HighBalanceForceAch = 'balance is above prefer ACH threshold',
  ForcedDebitCharge = 'forced debit only',
}
