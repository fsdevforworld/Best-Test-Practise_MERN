import {
  RecurringTransactionInterval,
  RecurringScheduleParams,
  RollDirection,
} from '@dave-inc/wire-typings';
import { Moment } from 'moment';
import { RecurringTransactionStatus, TransactionType } from '../../typings';
import { ExpectedTransactionStatus } from '../../models/expected-transaction';
import { RSched } from '../../lib/recurring-schedule';

export enum ModificationSource {
  System = 'system',
  API = 'api',
  Admin = 'admin',
}

export enum LookbackPeriod {
  Default = 60,
  EntireHistory = -1,
}

export { ExpectedTransactionStatus } from '../../models/expected-transaction';

export type ExpectedTransaction = {
  id: number;
  bankAccountId: number;
  userId: number;
  recurringTransactionId: number;
  bankTransactionId: BigInt;
  type: TransactionType;
  displayName: string;
  pendingDisplayName: string;
  expectedAmount: number;
  pendingAmount: number;
  settledAmount: number;
  expectedDate: Moment;
  pendingDate: Moment;
  settledDate: Moment;
  extra: any;
  created: Date;
  updated: Date;
  deleted: Date;
  status: ExpectedTransactionStatus;

  isGroundhog?: boolean;
  groundhogId?: string;
  groundhogRecurringTransactionId?: string;
};

export type RecurringTransaction = {
  id: number;
  bankAccountId: number;
  userId: number;
  transactionDisplayName: string;
  rsched: RSched;
  userAmount: number;
  userDisplayName: string;
  pendingDisplayName: string;
  type: TransactionType;
  status: RecurringTransactionStatus;
  possibleNameChange: string;
  missed: Moment;
  terminated: Moment;
  created: Moment;
  updated: Moment;
  deleted: Moment;
  isGroundhog?: boolean;
  groundhogId?: string;
};

// TODO: separate options from params
type BaseRecurringParams = Omit<RecurringTransaction, 'id' | 'created' | 'updated' | 'deleted'>;
export type RSchedArgParams = {
  interval: RecurringTransactionInterval;
  params: RecurringScheduleParams;
  rollDirection?: RollDirection;
  dtstart?: Moment;
};
export type CreateParams = Partial<BaseRecurringParams> &
  Partial<RSchedArgParams> & {
    skipValidityCheck?: boolean;
    bankTransactionId?: number;
    fromTransactionDisplayName?: string;
  };
export type UpdateParams = Partial<BaseRecurringParams> &
  Partial<RSchedArgParams> & {
    skipValidityCheck?: boolean;
  };

export type AnalyticsLocation = 'auto add';
