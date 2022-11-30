export enum ReimbursementStatus {
  Pending = 'PENDING',
  Unknown = 'UNKNOWN',
  Completed = 'COMPLETED',
  Returned = 'RETURNED',
  Canceled = 'CANCELED',
  Failed = 'FAILED',
}

type ReimbursementExtra = {
  note?: string;
  lineItems?: {
    [key: string]: {
      amount: number;
      reason: string;
    };
  };
  transactionResult: {
    status: string;
    id: string;
    network?: string;
    processor: string;
    data: {
      EC?: string;
      SC?: number;
      status?: string;
      gateway?: string;
      network?: string;
      networkID?: string;
      networkRC?: string;
      transactionID?: string;
      isSubscription?: boolean;
      processorHttpStatus?: number;
    };
    errorMessage: string | null;
  };
};

export type ReimbursementResponse = {
  id: number;
  userId: number;
  advanceId: number | null;
  subscriptionPaymentId: number | null;
  reimburserId: number | null;
  reimburser?: { email: string; id: number };
  reason: string;
  amount: string;
  externalProcessor: string | null;
  externalId: string | null;
  referenceId: string | null;
  status: 'PENDING' | 'UNKNOWN' | 'COMPLETED' | 'RETURNED' | 'CANCELED' | 'FAILED';
  payableId: number | null;
  payableType: string | null;
  zendeskTicketId: string | null;
  webhookData: {} | null;
  extra?: ReimbursementExtra;
  created: string;
  updated: string;
  displayName?: string;
  paymentType?: string;
};
