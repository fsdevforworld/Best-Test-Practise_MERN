export enum DaveBankingErrorCode {
  RequestError = 'REQUEST_ERROR',
  AuthorizationError = 'AUTHORIZATION_ERROR',
  UserError = 'USER_ERROR',
  SynapseError = 'SYNAPSE_ERROR',
  NotFoundError = 'NOT_FOUND_ERROR',
  InternalError = 'INTERNAL_ERROR',
}

export type PubsubConsumerConfig = {
  bankTransactions: {
    topicName: string;
    subscriptionName: string;
  };
  insufficientFundsTransaction: {
    topicName: string;
    subscriptionName: string;
  };
  projectId: string;
};
