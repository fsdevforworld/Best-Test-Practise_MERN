import { ILoggerInterface } from '@dave-inc/logger';
import { AccountActionError } from './account-action-errors';

export type AccountActionType = 'remove' | 'create' | 'update';

export class AccountAction<
  ActionResult,
  ActionError extends AccountActionError = AccountActionError
> {
  public type: AccountActionType;
  public action: PromiseLike<ActionResult>;
  public name: string;

  public logger?: ILoggerInterface;
  public result?: ActionResult | ActionError;

  public constructor(
    actionName: string,
    actionType: AccountActionType,
    actionPromise: PromiseLike<ActionResult>,
    logger?: ILoggerInterface,
  ) {
    this.name = actionName;
    this.action = actionPromise;
    this.type = actionType;
    this.logger = logger;
  }

  public async execute(): Promise<[string, ActionResult]> {
    try {
      this.result = await this.action;
      this.logger?.debug(
        `[user-account-${this.type}] The ${this.name} account action was completed successfully.`,
      );
      return [this.name, this.result];
    } catch (actionError) {
      this.result = actionError;
      this.logger?.error(
        `[user-account-${this.type}] Failure during ${this.name} action! | ERROR: ${actionError.message}`,
        actionError,
      );
      throw new AccountActionError(this.name, this.type, actionError.message);
    }
  }
}
