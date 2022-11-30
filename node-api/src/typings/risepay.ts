export type RisepayFetchTransactionResponse = RisepayTransaction | RisepayErrorResponse;

export type RisepayTransaction = {
  AuthorizationCode?: string;
  AccountInfo?: string;
  BillingAddress?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingCountry?: string;
  ExpirationInfo?: string;
  CardHolderName?: string;
  HostResponseMsg?: string;
  TransactionID: string;
  ResultId: string;
  ReferenceNumber: string;
  ResponseCode: string;
  ResponseMsg?: string;
  ResponseTransactionID?: string;
  RefundDate?: string;
  TransactionDateTime?: string;
  TransactionType: string;
  TransactionAmount: string;
  SettlementDate?: string;
  ServiceType?: string;
  VoidDate?: string;
};

export type RisepayCreateTransactionResponse = {
  TransactionID: string;
  ReferenceNumber: string;
  ResultID: string;
  ResultMessage: string;
  ResponseCode: string;
  ResponseMessage: string;
};

export type RisepayErrorResponse = {
  ResultID: string;
};

export type RisepayFetchTransactionQueryParams =
  | {
      ReferenceNumber: string;
    }
  | {
      TransactionID: string;
    };

export type RisepayProcessor = 'TABAPAY' | 'BLASTPAY' | 'PAYFI';
