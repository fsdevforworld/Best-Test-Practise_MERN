export enum IdentityVerificationError {
  NO_DOCUMENT = 'Identity verification is required to take out an advance',
  UNDER_REVIEW = 'Identity documents are still under review',
  LICENSE_REQUIRED = 'Please upload license',
  GENERAL_FAILURE = 'Identity verification process failed',
  CLOSED_PERMISSION = 'Looks like you may have two Dave accounts. Please delete this account and use your other account.',
}
