import { expect } from 'chai';
import { getAllNotFoundStatus } from '../../../src/domain/fetch-external-transaction/refresh-external-transaction';
import { moment } from '@dave-inc/time-lib';
import { PaymentGateway, PaymentProcessor } from '@dave-inc/loomis-client';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import {
  TransactionSettlementSource,
  RefreshExternalTransactionOptions,
} from '../../../src/typings';
import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';

describe('RefreshExternalTransaction', () => {
  it('getAllNotFoundStatus returns unknown status for a payment created within prior 24hrs', async () => {
    const paymentProvider = {
      gateway: PaymentGateway.Synapsepay,
      processor: PaymentProcessor.Synapsepay,
    };
    const options: RefreshExternalTransactionOptions = {
      advanceId: 99999,
      bankAccountId: 99999,
      paymentMethodId: 99999,
      created: moment().subtract(6, 'hour'),
      transactionSettlementSource: {
        sourceId: 9999,
        sourceType: TransactionSettlementSource.Advance,
      },
      type: PaymentProviderTransactionType.AdvancePayment,
    };
    const paymentStatus = getAllNotFoundStatus(options, [paymentProvider]);
    expect(paymentStatus).to.equal(ExternalTransactionStatus.Unknown);
  });
  it('getAllNotFoundStatus returns canceled status for a payment created more than a day ago', async () => {
    const paymentProvider = {
      gateway: PaymentGateway.Synapsepay,
      processor: PaymentProcessor.Synapsepay,
    };
    const options: RefreshExternalTransactionOptions = {
      advanceId: 99999,
      bankAccountId: 99999,
      paymentMethodId: 99999,
      created: moment().subtract(2, 'days'),
      transactionSettlementSource: {
        sourceId: 9999,
        sourceType: TransactionSettlementSource.Advance,
      },
      type: PaymentProviderTransactionType.AdvancePayment,
    };
    const paymentStatus = getAllNotFoundStatus(options, [paymentProvider]);
    expect(paymentStatus).to.equal(ExternalTransactionStatus.Canceled);
  });
});
