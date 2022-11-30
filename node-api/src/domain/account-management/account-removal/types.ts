import { DeleteRequest, User } from '../../../models';
import { AccountAction } from '../account-action';
import { PromiseResolution } from 'promise.allsettled';
import { ILoggerInterface } from '@dave-inc/logger';

export type DeleteAccountRequestOptions = {
  additionalInfo?: string;
  shouldOverrideSixtyDayDelete?: boolean;
};

export interface IAccountRemovalRequest extends IRequestAccountRemoval {
  options?: DeleteAccountRequestOptions;
}

export interface IRequestAccountRemoval {
  userId: number;
  reason: string;
  options?: Omit<DeleteAccountRequestOptions, 'shouldOverrideSixtyDayDelete'>;
}

export interface ISoftDeleteUserAccount extends IAccountRemovalRequest {
  user: User;
}

export type ExternalAccountsRemovedSuccessfully = PromiseResolution<DeleteRequest>;

export type DeleteRequestModelCreated = PromiseResolution<DeleteRequest>;

export class AccountRemovalAction<ARAResult = void | number> extends AccountAction<ARAResult> {
  public constructor(
    actionName: string,
    actionPromise: PromiseLike<ARAResult>,
    logger?: ILoggerInterface,
  ) {
    super(actionName, 'remove', actionPromise, logger);
  }
}

export type RemoveAccountsLinkedToUserActions = AccountRemovalAction[];

export type RemoveAccountsLinkedToUserActionsResults<RT = void | number> = PromiseFulfilledResult<
  RT[]
>;
