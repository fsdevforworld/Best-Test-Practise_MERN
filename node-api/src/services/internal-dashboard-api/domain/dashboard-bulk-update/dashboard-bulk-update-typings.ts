import { ApiAccountType } from '@dave-inc/banking-internal-api-client';
import { Rule } from '../../../../helper/fraud-rule';
export const validAccountTypes = [ApiAccountType.Checking, ApiAccountType.Goal] as const;

export type DashboardBulkUpdateExtra = {
  isHighPriorityAdminNote?: boolean;
  accountType?: typeof validAccountTypes[number];
};

export type BulkUpdateProcessInput = {
  inputUsers: number[];
  dashboardBulkUpdateId: number;
  internalUserId: number;
  primaryAction: string;
  actionLogNote?: string;
  reason: string;
  extra?: DashboardBulkUpdateExtra;
  dashboardActionLogId?: number;
};

export type UnprocessedOutputRow = {
  daveUserId: number;
  originalDaveUserIdList: number[];
  errorNote?: string;
  outstandingBalanceBeforeAction?: number;
  daveDashAdminNote?: string;
};

export type BulkUpdateProcessOutputRow = {
  daveUserId: string;
  originalDaveUserIdList: string;
  dateTimeActionTaken: string;
  primaryAction: string;
  reason: string;
  actionLog?: string;
  outstandingBalanceBeforeAction?: number;
  currentOutstandingBalance?: number;
  daveDashAdminNote?: string;
  cstAdminNote?: string;
  error?: string;
  secondaryAction?: string;
};

export type BulkUpdateConfig = {
  processChunkSize: number;
  maximumCSVFileSizeBytes: number;
  maximumNumberOfRows: number;
  rowProcessingBatchSize: number;
  outputCSVFileDelimiter: string;
  gCloudAuthURLBase: string;
};

export type RulesUserMap = { rule: Rule; originalUserIds: Set<number> };
