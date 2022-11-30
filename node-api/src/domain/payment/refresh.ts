import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import { PaymentProviderTransactionStatus } from '../../typings';

import { Payment } from '../../models';

import { extractFromExternalTransaction } from '../payment-provider';

import { updatePayment } from '.';

import {
  fetchExternalTransactions,
  fetchTransactionSettlement,
  mapTransactionSettlementStatus,
  PaymentUpdateTrigger,
} from './utils';

export async function refreshPayment(
  payment: Payment,
  trigger: PaymentUpdateTrigger = PaymentUpdateTrigger.DashboardRequest,
  { force = false }: { force?: boolean } = {},
) {
  const settlement = await fetchTransactionSettlement(payment);
  let updateParams;
  if (settlement && !force) {
    updateParams = {
      status: mapTransactionSettlementStatus(settlement.status),
    };
  } else {
    const externalTransactions = await fetchExternalTransactions(payment);

    if (externalTransactions.length === 0) {
      updateParams = { status: ExternalTransactionStatus.Canceled };
    } else {
      // TODO this should prefer PENDING or COMPLETED first as of right now
      // this will pick errored even if one of the results is COMPLETED
      let transactionOfRecord = externalTransactions.find(
        t =>
          t.status !== PaymentProviderTransactionStatus.Canceled &&
          t.status !== PaymentProviderTransactionStatus.Failed,
      );

      if (!transactionOfRecord) {
        transactionOfRecord = externalTransactions[externalTransactions.length - 1];
      }

      updateParams = extractFromExternalTransaction(transactionOfRecord);
    }
  }

  return updatePayment(payment, updateParams, true, trigger);
}
