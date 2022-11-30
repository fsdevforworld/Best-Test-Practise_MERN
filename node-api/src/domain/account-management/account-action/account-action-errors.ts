import { AccountActionType } from './account-action';
import { ConflictError } from '@dave-inc/error-types';
export class AccountActionError extends ConflictError {
  public actionName: string;
  public type: AccountActionType;

  public constructor(actionName: string, actionType: AccountActionType, message: string) {
    super(`${message} (account-action:${actionType})`);
    this.actionName = actionName;
    this.type = actionType;
  }
}

export class AccountRemovalError extends AccountActionError {
  public message: string;
  public error?: Error;

  public constructor(errMessage: string, error?: Error) {
    super('removeAccountById', 'remove', `[user-account-removal] ${errMessage}`);
    this.error = error;
  }
}
export class BatchAccountActionsError extends AccountActionError {
  public errors: AccountActionError[];
  public failedActions: string;

  public constructor(
    actionType: AccountActionType,
    message: string,
    errors: AccountActionError[],
    failedActions: string,
  ) {
    const errorMessage = `[BATCH-ACTION-ERRORS:(failed_actions:${failedActions})] ${message}`;
    super('BatchAccountActions', actionType, errorMessage);
    this.errors = errors;
    this.failedActions = failedActions;
    this.name = 'BatchAccountActionsError';
  }
}
