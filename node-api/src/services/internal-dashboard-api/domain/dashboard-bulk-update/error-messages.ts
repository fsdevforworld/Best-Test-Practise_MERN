import { validAccountTypes } from './dashboard-bulk-update-typings';
import { validCstOperations } from './process-bulk-cst-update';

export const ALREADY_FRAUD_BLOCKED = 'User already Fraud Blocked';
export const FAILED_FETCHING_BANK_ACCOUNTS = 'Failed fetching bank accounts';
export const INVALID_CST_OPERATION = `Given Bulk UpdateOperation is not valid for CST bulk updates. Valid CST Operations: ${validCstOperations}`;
export const INVALID_EXTRA_FIELD = `Given field 'extra' not a valid value. Valid values:  ${validAccountTypes}`;
export const MISSING_EXTRA_FIELD =
  'Bulk Update is missing the extra needed for a Bulk CST Operation: accountType.';
export const NO_ACCOUNT_FOUND = 'No accounts found to cancel for this user';
export const USER_DOES_NOT_EXIST = 'User does not exist';
export const USER_ALREADY_DELETED = 'User already deleted';
