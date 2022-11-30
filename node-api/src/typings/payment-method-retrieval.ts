import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

export type PaymentMethodRetrieval = {
  id: string;
  status: ExternalTransactionStatus;
};
