export function createRisepayResponse(
  referenceNumber: string,
  resultId = '0',
  transactionId?: string,
) {
  const data: { [key: string]: any } = {
    TransactionDateTime: '6/5/2018 12:43:52 PM',
    SettlementDate: '06/05/2018',
    VoidDate: '',
    RefundDate: '',
    TransactionType: 'Return',
    ServiceType: 'Debit',
    ResultID: resultId,
    TransactionAmount: '75.0000',
    ReferenceNumber: referenceNumber,
    AuthorizationCode: '000155',
    AccountInfo: '111111******8075',
    ExpirationInfo: '0222',
    CVV2: 'N',
    CardHolderName: 'James Harden',
    BillingAddress: '2516 Rockets Way',
    BillingZip: '77494',
    BillingCity: '',
    BillingState: '',
    BillingCountry: '',
    HostResponseMsg: 'COMPLETED VISA',
    ResponseCode: '00',
    ResponseMsg: 'APPROVED OR COMPLETED SUCCESSFULLY ',
    '3DProvider': '   ',
    ResponseTransactionID: 'yk0yCGHVQImAi_FvJKC33Q',
  };

  if (transactionId) {
    data.TransactionID = transactionId;
  }

  return data;
}

export function stubRisepayFetchCalls(stub: any, calls: any) {
  calls.forEach((call: any, idx: number) => {
    stub.onCall(idx).resolves(call);
  });

  return stub;
}
