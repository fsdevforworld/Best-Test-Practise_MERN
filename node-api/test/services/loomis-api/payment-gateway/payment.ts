import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '@dave-inc/loomis-client';
import { getGateway } from '../../../../src/domain/payment-provider';
import { expect } from 'chai';
import { clean, replayHttp } from '../../../test-helpers';

describe('PaymentHelper', () => {
  const fixtureDir = 'domain/payment';

  before(() => clean());

  it(
    'Should return a failed Tabapay transaction on failure',
    replayHttp(`${fixtureDir}/refresh-skip-decline.json`, async () => {
      const gateway = getGateway(PaymentGateway.Tabapay);
      const result = await gateway.fetchTransaction({
        daveUserId: 1,
        externalId: null,
        ownerId: '56310bc186c27373fbe8cab7',
        processor: PaymentProcessor.Tabapay,
        referenceId: 'test-ref-5',
        secret: '1',
        sourceId: '5c37916d51112300617059ee',
        type: PaymentProviderTransactionType.AdvancePayment,
      });
      expect(result).to.contain({
        amount: 0.01,
        externalId: 'j1ogKPwVCK8DOm3-JldM2w',
        gateway: PaymentGateway.Tabapay,
        processor: PaymentProcessor.Tabapay,
        referenceId: 'test-ref-5',
        reversalStatus: ReversalStatus.Failed,
        status: PaymentProviderTransactionStatus.Canceled,
        type: PaymentProviderTransactionType.AdvancePayment,
      });
    }),
  );

  it(
    'Should return SynapsePay pending',
    replayHttp(`${fixtureDir}/refresh-skip-decline.json`, async () => {
      const gateway = getGateway(PaymentGateway.Synapsepay);
      const result = await gateway.fetchTransaction({
        daveUserId: 1,
        externalId: null,
        ownerId: '56310bc186c27373fbe8cab7',
        processor: PaymentProcessor.Synapsepay,
        referenceId: 'test-ref-5',
        secret: '1',
        sourceId: '5c37916d51112300617059ee',
        type: PaymentProviderTransactionType.AdvancePayment,
      });
      expect(result).to.contain({
        amount: 10,
        externalId: '5c783b57af7f75006647c50c',
        gateway: PaymentGateway.Synapsepay,
        processor: PaymentProcessor.Synapsepay,
        referenceId: 'test-ref-5',
        reversalStatus: null,
        status: PaymentProviderTransactionStatus.Pending,
      });
    }),
  );
});
