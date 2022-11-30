import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
} from '@dave-inc/loomis-client';
import { getGateway } from '../../../../src/domain/payment-provider';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, replayHttp } from '../../../test-helpers';

describe('FetchSubscriptionPayment', () => {
  const fixturePath = '/domain/fetch-external-transaction';

  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it(
    'sucessfully fetches a transaction from SynapsePay',
    replayHttp('domain/payment-provider/synapsepay/fetch-with-user.json', async () => {
      const userSynapseId = '5d9be7e677ce003fa75f40e7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const externalId = '5d9be7ea49c75b1b5662c483';
      const userId = 12345;
      const gateway = getGateway(PaymentGateway.Synapsepay);

      const result = await gateway.fetchTransaction({
        daveUserId: userId,
        externalId,
        ownerId: userSynapseId,
        processor: PaymentProcessor.Synapsepay,
        referenceId: undefined,
        secret: userId.toString(),
        sourceId: synapseNodeId,
        type: PaymentProviderTransactionType.SubscriptionPayment,
      });
      expect(result).to.contain({
        externalId,
        referenceId: 'asdfsdf',
        amount: 100,
        gateway: PaymentGateway.Synapsepay,
        status: PaymentProviderTransactionStatus.Pending,
        processor: PaymentProcessor.Synapsepay,
        reversalStatus: null,
      });
    }),
  );

  it(
    'successfully fetches a transaction from TabaPay when SynapsePay fails',
    replayHttp(`${fixturePath}/fetch-subscription-tabapay-success.json`, async () => {
      const userId = 12345;
      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';

      const gateway = getGateway(PaymentGateway.Tabapay);

      const result = await gateway.fetchTransaction({
        daveUserId: userId,
        externalId,
        referenceId,
        processor: PaymentProcessor.Tabapay,
        sourceId: undefined,
        type: PaymentProviderTransactionType.SubscriptionPayment,
      });
      expect(result).to.contain({
        externalId,
        referenceId,
        amount: 1,
        gateway: PaymentGateway.Tabapay,
        status: PaymentProviderTransactionStatus.Completed,
        processor: PaymentProcessor.Tabapay,
        reversalStatus: ReversalStatus.Failed, // I think this should actually be null because the payload has no reversal
      });
      expect(result.outcome.code).to.equal('00');
    }),
  );

  it(
    'handles not found from all services',
    replayHttp(`${fixturePath}/fetch-subscription-not-found.json`, async () => {
      const referenceId = 'my-test-ref-4';
      const externalId = 'my-test-external-4';
      const userSynapseId = '56310bc186c27373fbe8cab7';
      const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
      const userId = 12345;
      const gateway = getGateway(PaymentGateway.Synapsepay);

      const result = await gateway.fetchTransaction({
        daveUserId: userId,
        externalId,
        ownerId: userSynapseId,
        processor: PaymentProcessor.Synapsepay,
        referenceId,
        secret: userId.toString(),
        sourceId: synapseNodeId,
        type: PaymentProviderTransactionType.SubscriptionPayment,
      });
      expect(result).to.contain({
        externalId,
        referenceId,
        amount: null,
        gateway: PaymentGateway.Synapsepay,
        status: PaymentProviderTransactionStatus.NotFound,
        processor: PaymentProcessor.Synapsepay,
        type: PaymentProviderTransactionType.SubscriptionPayment,
        reversalStatus: null,
        outcome: null,
      });
    }),
  );
});
