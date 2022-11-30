export enum AdvanceFailureMessageKey {
  BalanceTooLow = 'BalanceTooLow',
  CannotBePaidToday = 'CannotBePaidToday',
  HasPendingPayment = 'HasPendingPayment',
  MicroDepositFourDays = 'MicroDepositFourDays',
  PredictedUpcomingIncome = 'PredictedUpcomingIncome',
}

export enum ConstraintMessageKey {
  AdvanceRequestEarlyPayment = 'AdvanceRequestEarlyPayment',
  BankUserNameUpdate = 'BankUserNameUpdate',
  DeleteAssocMxUser = 'DeleteAssocMxUser',
  EmailAlreadyVerifiedNoMoreUpdates = 'EmailAlreadyVerifiedNoMoreUpdates',
  MembershipAlreadyPaused = 'MembershipAlreadyPaused',
  ModifyFirstTransaction = 'ModifyFirstTransaction',
  OnlyBankConnection = 'OnlyBankConnection',
  UserPublicIncident = 'UserPublicIncident',
  UserWithExistingEmail = 'UserWithExistingEmail',
  DenyUpdateAddress = 'DenyUpdateAddress',
}

export enum ExternalEvent {
  EmpyrEventFetch = 'EmpyrEventFetch',
  EmpyrEventSave = 'EmpyrEventSave',
  EmpyrOfferFetch = 'EmpyrOfferFetch',
  EmpyrSignature = 'EmpyrSignature',
  EmpyrTokenFetch = 'EmpyrTokenFetch',
}

export enum FailureMessageKey {
  DefaultAccountDisconnected = 'DefaultAccountDisconnected',
  EmpyrCardUnlink = 'EmpyrCardUnlink',
  PasswordResetEmailError = 'PasswordResetEmailError',
  UserOfferLink = 'UserOfferLink',
  TransactionProcessingFailure = 'TransactionProcessingFailure',
  SendMfaCodeFailure = 'SendMfaCodeFailure',
}

export enum ForbiddenMessageKey {
  PaymentMethodPatchForbidden = 'PaymentMethodPatchForbidden',
  VerifyBankSSNForbidden = 'VerifyBankSSNForbidden',
  ChangePhoneNumberRequestForbidden = 'ChangePhoneNumberRequestForbidden',
}

export enum InvalidCredentialsMessageKey {
  InvalidSSNLast4 = 'InvalidSSNLast4',
  InvalidAuthToken = 'InvalidAuthToken',
}

export enum InvalidParametersMessageKey {
  AdvanceDeliveryType = 'AdvanceDeliveryType',
  AlreadyUsedGetTwoFreeMonths = 'AlreadyUsedGetTwoFreeMonths',
  BaseInvalidParametersError = 'BaseInvalidParametersError',
  Card23 = 'Card23',
  Card24 = 'Card24',
  CardThreeMonthValidity = 'CardThreeMonthValidity',
  CardTypeAccountType = 'CardTypeAccountType',
  ChangeRequestExpired = 'ChangeRequestExpired',
  DeleteRequestAlreadyProcessed = 'DeleteRequestAlreadyProcessed',
  IncidentAlreadyResolved = 'IncidentAlreadyResolved',
  IncidentDoesNotExist = 'IncidentDoesNotExist',
  IncidentNotDeletableAlreadyResolved = 'IncidentNotDeletableAlreadyResolved',
  IncidentNotDeletableNotFound = 'IncidentNotDeletableNotFound',
  IncidentTitleAndDescriptionUniqueness = 'IncidentTitleAndDescriptionUniqueness',
  InvalidBirthdate = 'InvalidBirthdate',
  InvalidHustleId = 'InvalidHustleId',
  InvalidImageType = 'InvalidImageType',
  InvalidParametersPaymentMethodId = 'Missing paymentMethodId',
  InvalidVerificationCode = 'InvalidVerificationCode',
  InvalidEmailEntry = 'InvalidEmailEntry',
  InvalidPhoneNumberEntry = 'InvalidPhoneNumberEntry',
  InvalidZipCodeEntry = 'InvalidZipCodeEntry',
  InvalidMfaCodeNumDigits = 'InvalidMfaCodeNumDigits',
  InvalidSSNLast4Format = 'InvalidSSNLast4Format',
  InvalidLogin = 'InvalidLogin',
  LegacyVerificationCode = 'LegacyVerificationCode',
  LinkExpired = 'LinkExpired',
  LoginMinVersionError = 'LoginMinVersionError',
  MissingEmailOrPhoneNumber = 'MissingEmailOrPhoneNumber',
  MissingBankAccountId = 'MissingBankAccountId',
  MissingPaymentMethodId = 'MissingPaymentMethodId',
  MustProvideReason = 'MustProvideReason',
  NewPhoneNumberAlreadyUsed = 'NewPhoneNumberAlreadyUsed',
  NoImageProvided = 'NoImageProvided',
  OneAdvanceAtATime = 'OneAdvanceAtATime',
  PasswordAndEmailOrPhone = 'PasswordAndEmailOrPhone',
  PasswordAndEmail = 'PasswordAndEmail',
  PasswordDoesNotMatch = 'PasswordDoesNotMatch',
  PaymentMustBePositive = 'PaymentMustBePositive',
  PaymentMethodOrBankAccountRequired = 'PaymentMethodOrBankAccountRequired',
  PaymentTooLargeForAccountBalance = 'PaymentTooLargeForAccountBalance',
  PleaseContactCustomerService = 'PleaseContactCustomerService',
  PhoneNumberAccountsDoNotMatch = 'PhoneNumberAccountsDoNotMatch',
  PhoneNumberAlreadyLinkedToAnAccount = 'PhoneNumberAlreadyLinkedToAnAccount',
  PromotionDoesNotExist = 'PromotionDoesNotExist',
  ResetPasswordMinVersionError = 'ResetPasswordMinVersionError',
  SendVerificationMinVersionError = 'SendVerificationMinVersionError',
  TextResubscribe = 'TextResubscribe',
  TipPercentAmountZeroFifty = 'TipPercentAmountZeroFifty',
  TransactionsArray = 'TransactionsArray',
  TokenExpired = 'TokenExpired',
  TooSoonToCreateNewAccount = 'TooSoonToCreateNewAccount',
  UnsupportedCardType = 'UnsupportedCardType',
  UserAlreadyRedeemedPromotion = 'UserAlreadyRedeemedPromotion',
  UserNoEmailSet = 'UserNoEmailSet',
  VerificationCode = 'VerificationCode',
  VerificationCodeIsInvalid = 'VerificationCodeIsInvalid',
  WrongDigits = 'WrongDigits',
  WrongLengthForVerificationCode = 'WrongLengthForVerificationCode',
}

export enum MembershipPauseMessageKey {
  MembershipPauseDate = 'MembershipPauseDate',
  OutstandingAdvancePause = 'OutstandingAdvancePause',
}

export enum NotFoundMessageKey {
  AdvanceNotFound = 'AdvanceNotFound',
  AdvanceNotFoundById = 'AdvanceNotFoundById',
  BankAccountNotFound = 'BankAccountNotFound',
  BankAccountNotFoundById = 'BankAccountNotFoundById',
  DaveBankingUserNotFound = 'DaveBankingUserNotFound',
  DebitCardNotFound = 'DebitCardNotFound',
  EmailVerificationNotFound = 'EmailVerificationNotFound',
  HustleJobPackNotFound = 'HustleJobPackNotFound',
  HustleExternalIdNotFound = 'HustleExternalIdNotFound',
  NoInstitutionFound = 'NoInstitutionFound',
  PaymentMethodNotFound = 'PaymentMethodNotFound',
  PaymentMethodPatchNotFound = 'PaymentMethodPatchNotFound',
  PhoneNumberNotFound = 'PhoneNumberNotFound',
  PhoneNumberChangeRequestNotFound = 'PhoneNumberChangeRequestNotFound',
  SessionNotFoundByDeviceId = 'SessionNotFoundByDeviceId',
  SubscriptionBillingNotFound = 'SubscriptionBillingNotFound',
  DaveBankingUserNotFoundTryAgain = 'DaveBankingUserNotFoundTryAgain',
  UserNotFound = 'UserNotFound',
  UserNotFoundByEmailOrPhone = 'UserNotFoundByEmailOrPhone',
  UserNotFoundTryAgain = 'UserNotFoundTryAgain',
}

export enum RateLimitMessageKey {
  TooManyFailedCodeVerificationAttemptsTryLater = 'TooManyFailedCodeVerificationAttemptsTryLater',
  TooManyFailedLoginAttemptsTryLater = 'TooManyFailedLoginAttemptsTryLater',
  TooManyFailedPasswordConfirmAttemptsTryLater = 'TooManyFailedPasswordConfirmAttemptsTryLater',
  TooManySendCodeAttemptsTryLater = 'TooManySendCodeAttemptsTryLater',
  TooManyVerifyBankSSNAttemptsTryLater = 'TooManyVerifyBankSSNAttemptsTryLater',
  TooManyRequests = 'TooManyRequests',
}

export enum UnsupportedErrorKey {
  UnsupportedBankConnection = 'UnsupportedBankConnection',
}

export enum MiddlewareErrorKey {
  SendErrorId = 'SendErrorId',
}

export enum MicrodepositVerificationKey {
  BankAccountAlreadyVerified = 'BankAccountAlreadyVerified',
  CantVerifyMicroDeposit = 'SynapseCantVerifyMicroDeposit',
  VerifiedMicroDeposit = 'SynapseVerifiedMicroDeposit',
}

export enum ThirdPartySupportTicketError {
  ThirdPartySupportTicketInvalidBrand = 'ThirdPartSupportTicketInvalidBrand',
  ThirdPartySupportTicketTooManyAttachments = 'ThirdPartySupportTicketTooManyAttachments',
  ThirdPartySupportTicketUserReasonsFailure = 'ThirdPartySupportTicketUserReasonsFailure',
}

export enum ConflictMessageKey {
  PasswordCannotBeChanged = 'PasswordCannotBeChanged',
}

export enum UnprocessableEntityKey {
  InvalidAddress = 'InvalidAddress',
  InvalidAddressMissingUnit = 'InvalidAddressMissingUnit',
  InvalidAddressInvalidUnit = 'InvalidAddressInvalidUnit',
  InvalidAddressIsCommercial = 'InvalidAddressIsCommercial',
}

export enum USPSErrorKey {
  USPSVerifyAddress = 'USPSVerifyAddress',
}

export enum SideHustleErrorKey {
  AppcastDown = 'SystemTemporarilyDown',
}
