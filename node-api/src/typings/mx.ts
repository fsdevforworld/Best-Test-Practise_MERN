export {
  Account as MxAccount,
  AccountNumber as MxAccountNumber,
  MemberConnectionStatus as MxMemberConnectionStatus,
  Member as MxMember,
  Transaction as MxTransaction,
  ConnectWidgetRequestBody as MxConnectWidgetRequestBody,
} from 'mx-atrium/atrium';

export type MxError = Error & {
  response: {
    statusCode: number;
    body: {
      error: {
        message: string;
      };
    };
  };
};

export enum MxAccountType {
  Checking = 'CHECKING',
  Saving = 'SAVINGS',
  Loan = 'LOAN',
  CreditCard = 'CREDIT_CARD',
  Investment = 'INVESTMENT',
  LineOfCredit = 'LINE_OF_CREDIT',
  Mortgage = 'MORTGAGE',
  Property = 'PROPERTY',
  Cash = 'CASH',
  Insurance = 'INSURANCE',
  Prepaid = 'PREPAID',
}

export enum MxAccountSubtype {
  MoneyMarket = 'MONEY_MARKET',
  CertificateOfDeposit = 'CERTIFICATE_OF_DEPOSIT',
  Auto = 'AUTO',
  Student = 'STUDENT',
  SmallBusiness = 'SMALL_BUSINESS',
  Personal = 'PERSONAL',
  PersonalWithCollateral = 'PERSONAL_WITH_COLLATERAL',
  HomeEquity = 'HOME_EQUITY',
  Boat = 'BOAT',
  Powersports = 'POWERSPORTS',
  Rv = 'RV',
}

export enum MxTransactionType {
  Credit = 'CREDIT',
  Debit = 'DEBIT',
}

export enum MxTransactionStatus {
  Pending = 'PENDING',
  Posted = 'POSTED',
  Received = 'RECEIVED',
}

export enum MxMemberStatus {
  Initiated = 'INITIATED',
  Authenticated = 'AUTHENTICATED',
  Received = 'RECEIVED',
}

export enum MxConnectionStatus {
  Challenged = 'CHALLENGED', // The member has been challenged by multi-factor authentication.
  Closed = 'CLOSED', // The end user, MX, the client, or a partner has marked the member as closed.
  Connected = 'CONNECTED', // The member was successfully authenticated and data is now aggregating.
  Degraded = 'DEGRADED', // Aggregation has failed at least three times within a short period of time.
  Delayed = 'DELAYED', // Aggregating the member has taken longer than expected and it has not yet been connected.
  Denied = 'DENIED', // The credentials provided for the member were invalid.
  Disabled = 'DISABLED', // Aggregation has been momentarily paused, but the member is still connected.
  Disconnected = 'DISCONNECTED', // Aggregation has failed at least three times and has not succeeded for at least two weeks.
  Discontinued = 'DISCONTINUED', // The connection to this financial institution is no longer available.
  Expired = 'EXPIRED', // The MFA answer was not provided within the time allotted by the financial institution.
  Failed = 'FAILED', // Aggregation failed without being connected.
  Impaired = 'IMPAIRED', // 	The member is missing some or all credentials needed in order to connect.
  Impeded = 'IMPEDED', // The end user’s attention is required at their online banking institution, e.g., there is a marketing message that must be viewed, terms and conditions that must be accepted, etc.
  Imported = 'IMPORTED', // MX does not have credentials and will not try to aggregate the member until the end user provides credentials.
  Locked = 'LOCKED', // The financial institution is preventing authentication. The end user must contact the financial institution.
  Prevented = 'PREVENTED', // MX is preventing aggregation until the member’s credentials have been updated
  Reconnected = 'RECONNECTED', // The member has been migrated to a new data source and aggregation is likely to trigger one-time password MFA. MX will not perform background aggregation in order to avoid unnecessarily disruptive texts, emails, etc. The member must be re-aggregated in the foreground with the end user present.
  Rejected = 'REJECTED', // An MFA challenge was answered incorrectly.
  Resumed = 'RESUMED', // The answer to an MFA challenge was received, but it is not yet clear whether it was correct.
  Updated = 'UPDATED', // The member has been updated — i.e., credentials have been updated — but it has not yet been connected
}

export enum MxWebhookEventType {
  Aggregation = 'AGGREGATION',
  ConnectionStatus = 'CONNECTION_STATUS',
}

export enum MxAggregationWebhookEventAction {
  MemberDataUpdated = 'member_data_updated',
}

export enum MxConnectionStatusWebhookEventAction {
  Changed = 'CHANGED',
}

export interface IMxWebhookEventData {
  type: MxWebhookEventType;
  action: MxAggregationWebhookEventAction | MxConnectionStatusWebhookEventAction;
  member_guid: string;
  user_guid: string;
}

export interface IMxAggregationWebhookEventData extends IMxWebhookEventData {
  type: MxWebhookEventType.Aggregation;
  action: MxAggregationWebhookEventAction;
  transactions_created_count: number;
  transaction_updated_count: number;
  completed_at: number; // unix timestamp
  completed_on: string; // YYYY-MM-DD date string
}

export interface IMxConnectionStatusWebhookEventData extends IMxWebhookEventData {
  type: MxWebhookEventType.ConnectionStatus;
  action: MxConnectionStatusWebhookEventAction;
  connection_status: MxConnectionStatus;
  connection_status_id: string;
  connection_status_message: string;
}
