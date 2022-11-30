import { AccountActionError } from './account-action-errors';

export type ActionOutcome = 'success' | 'failure';

export interface IAccountActionSuccess<Result> {
  outcome: 'success';
  result: Result;
}

export interface IAccountActionFailure<ET> {
  outcome: 'failure';
  error: ET;
}

export interface IActionResult<R, E extends AccountActionError, T = ActionOutcome> {
  outcome: T;
  result?: R;
  error?: E;
}

export type PendingAccountActionResult<S, F extends AccountActionError> =
  | IAccountActionSuccess<S>
  | IAccountActionFailure<F>;

export interface IPendingActionResult<R, E> {
  outcome: ActionOutcome;
  result?: R | undefined;
  error?: E | undefined;
}

export class AccountActionResult<RT = unknown, ET extends AccountActionError = AccountActionError>
  implements IActionResult<RT, ET> {
  public outcome: ActionOutcome;
  public result?: RT;
  public error?: ET;

  public constructor({ outcome, result, error }: IPendingActionResult<RT, ET>) {
    this.outcome = outcome;
    this.result = result;
    this.error = error;
  }

  public async success(): Promise<IAccountActionSuccess<RT>> {
    return new AccountActionSuccess(this.result);
  }

  public async failure(): Promise<IAccountActionFailure<ET>> {
    return new AccountActionFailure(this.error);
  }
}

export class AccountActionSuccess<RT> implements IAccountActionSuccess<RT> {
  public outcome: 'success';
  public result: RT;
  public name: string = 'AccountActionSuccess';

  public constructor(result: RT) {
    this.outcome = 'success';
    this.result = result;
  }
}

export class AccountActionFailure<ET extends AccountActionError = AccountActionError>
  implements IAccountActionFailure<ET> {
  public outcome: 'failure';
  public error: ET;
  public actionName!: string;
  public name: string = 'AccountActionFailure';

  public constructor(error: ET) {
    this.outcome = 'failure';
    this.actionName = error.actionName;
    this.error = error;
  }
}
