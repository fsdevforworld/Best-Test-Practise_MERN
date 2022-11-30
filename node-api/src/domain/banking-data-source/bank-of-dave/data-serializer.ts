import { moment } from '@dave-inc/time-lib';
import { DaveBankingPubSubTransaction } from '@dave-inc/wire-typings';
import { get } from 'lodash';
import { BankTransactionResponse } from '../../../typings';

export class BankOfDaveDataSerializer {
  public static serializePubSubTransactions(
    accountId: string,
    response: DaveBankingPubSubTransaction[],
  ): BankTransactionResponse[] {
    return response.map(t => this.serializePubSubTransaction(accountId, t));
  }

  private static serializePubSubTransaction(
    accountId: string,
    t: DaveBankingPubSubTransaction,
  ): BankTransactionResponse {
    let amount;
    if (t.debit) {
      // if it is a debit transaction
      // want to return a negative value
      amount = -t.amount;
    } else {
      // if it is a credit transaction
      // want to return a positive value
      amount = t.amount;
    }

    const transactionDateString = moment(t.transactedAt).format('YYYY-MM-DD');

    return {
      externalId: t.uuid,
      bankAccountExternalId: accountId,
      amount,
      transactionDate: moment(transactionDateString),
      pending: t.pending,
      externalName: get(t, 'source.name', 'undefined'),
      plaidCategoryId: t.mcc ? t.mcc.toString() : undefined,
      plaidCategory: [],
      referenceNumber: t.uuid,
      metadata: t.source,
      cancelled: t.cancelled,
      returned: t.returned,
    };
  }
}
