import { JobManager } from '../typings';
import { MatchPaymentBankTransaction } from './match-payment-bank-transaction';
import { BroadcastSubscriptionPayment } from './broadcast-subscription-payment';
import { BroadcastBankDisconnect } from './broadcast-bank-disconnect';

export * from './match-payment-bank-transaction';
export * from './broadcast-subscription-payment';
export * from './broadcast-bank-disconnect';

// REMOVE `/docs/chores/TASK_MIGRATION.md` when this file is removed.
export const Managers: JobManager[] = [
  MatchPaymentBankTransaction,
  BroadcastBankDisconnect,
  BroadcastSubscriptionPayment,
];
