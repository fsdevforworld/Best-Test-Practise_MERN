export interface IAuditEventType {
  success: string;
  failure: string;
}

class AccountRemoval implements IAuditEventType {
  public readonly success = 'USER_SOFT_DELETED';
  public readonly failure = 'USER_SOFT_DELETE_FAILURE';
}

export const AccountRemovalEvent = new AccountRemoval();
