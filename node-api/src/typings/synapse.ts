export const enum SynapsepayTransactionStatus {
  QueuedBySynapse = 'QUEUED-BY-SYNAPSE',
  QueuedByReceiver = 'QUEUED-BY-RECEIVER',
  Created = 'CREATED',
  ProcessingDebit = 'PROCESSING-DEBIT',
  ProcessingCredit = 'PROCESSING-CREDIT',
  Settled = 'SETTLED',
  Canceled = 'CANCELED',
  Returned = 'RETURNED',
}

export const enum SynapsepayTransactionStatusId {
  QueuedBySynapse = '-1',
  QueuedByReceiver = '0',
  Created = '1',
  ProcessingDebit = '2',
  ProcessingCredit = '3',
  Settled = '4',
  Canceled = '5',
  Returned = '6',
}

export enum SynapsepayDocumentPermission {
  Unverified = 'UNVERIFIED',
  SendAndReceive = 'SEND-AND-RECEIVE',
  Locked = 'LOCKED',
  MakeItGoAway = 'MAKE-IT-GO-AWAY',
  Closed = 'CLOSED',
}

export enum SynapsepayDocumentSSNStatus {
  Reviewing = 'REVIEWING',
  Valid = 'VALID',
  Invalid = 'INVALID',
  Blacklist = 'BLACKLIST',
}

export enum SynapsepayDocumentLicenseStatus {
  Reviewing = 'REVIEWING',
  Valid = 'VALID',
  Invalid = 'INVALID',
}

export enum SynapsepayPhoneNumber2FAStatus {
  Reviewing = 'REVIEWING',
  Valid = 'VALID',
  Invalid = 'INVALID',
  Pending = 'MFA_PENDING',
}

export enum SynapsepayDeliverabilityStatus {
  UspsDeliverable = 'usps_deliverable',
  Deliverable = 'deliverable',
  DeliverableIncorrectUnit = 'deliverable_incorrect_unit',
  DeliverableMissingUnit = 'deliverable_missing_unit',
  DeliverableUnnecessaryUnit = 'deliverable_unnecessary_unit',
  GoogleUndeliverable = 'google_undeliverable',
  Error = 'error',
}

export enum SynapsepayDocumentWatchlists {
  LicenseUploadRequired = 'SOFT_MATCH|PENDING_UPLOAD',
}
