import { AuditLog, User } from '../../../models';
import {
  AccountActionError,
  BatchAccountActionsError,
  AccountAction,
  IAuditEventType,
  AccountActionSuccess,
} from '../account-action';

import * as allSettled from 'promise.allsettled';
import { AccountActionType } from './account-action';
allSettled.shim();

export type BatchedAccountActions<AAResult, AAError extends AccountActionError> = Array<
  AccountAction<AAResult, AAError>
>;

function failedActionFilter(result: PromiseSettledResult<any>) {
  return result.status === 'rejected';
}

function anyBatchedActionsFailed<ActionResultTypes = unknown>(
  results: Array<PromiseSettledResult<ActionResultTypes>>,
) {
  return results.some(failedActionFilter);
}

export function auditBatchActionsSuccessful(
  userId: number,
  auditLogType: IAuditEventType,
): Promise<AuditLog> {
  return AuditLog.create<AuditLog>({
    userId,
    type: auditLogType.success,
    successful: true,
    eventUuid: userId,
  });
}

export async function auditBatchActionsFailure<ActionResultTypes = unknown>(
  actionType: AccountActionType,
  batchedResults: Array<PromiseSettledResult<[string, ActionResultTypes]>>,
  userId: number,
  auditLogType: IAuditEventType,
): Promise<BatchAccountActionsError> {
  const failures = batchedResults
    .filter(failedActionFilter)
    .map(result => (result as allSettled.PromiseRejection<AccountActionError>).reason);
  const failedActions: string = failures.map((f: any) => f.actionName).join(',');
  const failureMessage = `${failures.length} failure(s) occurred during actions which remove externally linked accounts.`;

  await AuditLog.create({
    userId,
    type: auditLogType.failure,
    successful: false,
    message: failureMessage,
    eventUuid: userId,
  });

  return new BatchAccountActionsError(actionType, `${failedActions}`, failures, failedActions);
}

export async function processBatchAccountActions(
  actionType: AccountActionType,
  actions: Array<AccountAction<unknown>>,
  user: User,
  auditEvent: IAuditEventType,
): Promise<AccountActionSuccess<AuditLog>> {
  const actionResults = await Promise.allSettled(
    actions.map(async (a: AccountAction<unknown>) => await a.execute()),
  );

  if (anyBatchedActionsFailed(actionResults)) {
    const error: BatchAccountActionsError = await auditBatchActionsFailure(
      actionType,
      actionResults,
      user.id,
      auditEvent,
    );
    throw error;
  }

  const result = await auditBatchActionsSuccessful(user.id, auditEvent);

  return new AccountActionSuccess<AuditLog>(result);
}
