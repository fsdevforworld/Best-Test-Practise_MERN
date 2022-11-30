import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import { getGateway } from '../../../src/domain/payment-provider';
import app from '../../../src/services/loomis-api';
import {
  CreateTransactionOptions,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import * as sinon from 'sinon';

describe('Loomis Create Transaction API', () => {
  const LOOMIS_ROUTE = '/services/loomis_api/transaction';
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  const invalidGatewayData: Array<{
    testName: string;
    payload?: {
      gatewayName?: string;
      options?: CreateTransactionOptions;
    };
  }> = [
    {
      testName: 'empty request body',
      payload: undefined,
    },
    {
      testName: 'empty transaction options',
      payload: { gatewayName: PaymentGateway.Synapsepay },
    },
    {
      testName: 'empty gateway name',
      payload: {
        options: {
          type: PaymentProviderTransactionType.AdvancePayment,
          referenceId: 'ostrich-123-xyz',
          sourceId: 'my-favorite-ostrich',
          amount: 25.0,
        },
      },
    },
  ];

  invalidGatewayData.forEach(({ testName, payload }) =>
    it(`Should give an InvalidParameters error for ${testName}`, async () => {
      await request(app)
        .post(LOOMIS_ROUTE)
        .send(payload)
        .expect(400)
        .then(({ body }) => {
          expect(body.type).to.eq('invalid_parameters');
          expect(body.message).to.contain('Missing gateway or required options');
        });
    }),
  );

  const fakeTransactionOptions: CreateTransactionOptions = {
    type: PaymentProviderTransactionType.AdvancePayment,
    referenceId: 'ostrich-123-xyz',
    sourceId: 'my-favorite-ostrich',
    amount: 25.0,
  };

  const fakeTransaction: PaymentProviderTransaction = {
    externalId: 'ostrich-ostrich-ostrich',
    referenceId: 'ostrich-123-xyz',
    amount: 25.0,
    gateway: PaymentGateway.Synapsepay,
    processor: PaymentProcessor.Synapsepay,
    status: PaymentProviderTransactionStatus.Completed,
    reversalStatus: null,
  };

  it('should correctly call create transaction', async () => {
    const payload = {
      gatewayName: PaymentGateway.Synapsepay,
      options: fakeTransactionOptions,
    };
    const rawGateway = getGateway(payload.gatewayName);

    const gatewayStub = sandbox.stub(rawGateway, 'createTransaction').resolves(fakeTransaction);

    await request(app)
      .post(LOOMIS_ROUTE)
      .send(payload)
      .expect(200)
      .then(response => {
        expect(response.body).to.deep.equal(fakeTransaction);
      });

    expect(gatewayStub).to.have.been.calledWith(fakeTransactionOptions);
  });
});
