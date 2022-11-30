import { formatCreateTransactionResponse } from '../../../../src/domain/payment-provider/tabapay/serializer';
import {
  CreateTransactionOptions,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionType,
  TabapayCreateTransactionResponse,
  TabapayNetworkResponseCode,
  TabapayRequestTransactionStatus,
} from '@dave-inc/loomis-client';
import factory from '../../../factories';
import { expect } from 'chai';
import * as Faker from 'faker';

describe('TabapaySerializer', () => {
  describe('createTransaction', () => {
    it('Format standard create transaction response', async () => {
      const payload: TabapayCreateTransactionResponse = await factory.build(
        'tabapay-create-transaction-response',
        {
          status: TabapayRequestTransactionStatus.Completed,
        },
      );

      const options: CreateTransactionOptions = {
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        referenceId: Faker.random.alphaNumeric(10),
        sourceId: Faker.random.alphaNumeric(10),
        amount: Faker.random.number(100),
      };

      const formatted = formatCreateTransactionResponse(payload, options);

      expect(formatted.type).to.equal(options.type);
      expect(formatted.externalId).to.equal(payload.transactionID);
      expect(formatted.referenceId).to.equal(options.referenceId);
      expect(formatted.amount).to.equal(options.amount);
      expect(formatted.gateway).to.equal(PaymentGateway.Tabapay);
      expect(formatted.outcome).to.deep.equal({ code: payload.networkRC });
      expect(formatted.processor).to.equal(PaymentProcessor.Tabapay);
      expect(formatted.raw).to.equal(payload);
      expect(formatted.status).to.equal(TabapayRequestTransactionStatus.Completed);
    });

    it('Mark network response code 91 as pending transactions', async () => {
      const payload: TabapayCreateTransactionResponse = await factory.build(
        'tabapay-create-transaction-response',
        {
          status: TabapayRequestTransactionStatus.Error,
          networkRC: TabapayNetworkResponseCode.INOPERATIVE,
        },
      );

      const options: CreateTransactionOptions = {
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        referenceId: Faker.random.alphaNumeric(10),
        sourceId: Faker.random.alphaNumeric(10),
        amount: Faker.random.number(100),
      };

      const formatted = formatCreateTransactionResponse(payload, options);

      expect(formatted.outcome).to.deep.equal({ code: payload.networkRC });
      expect(formatted.status).to.equal(TabapayRequestTransactionStatus.Pending);
    });
  });
});
