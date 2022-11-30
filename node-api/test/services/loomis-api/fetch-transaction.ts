import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import { getGateway } from '../../../src/domain/payment-provider';
import app from '../../../src/services/loomis-api';
import {
  FetchTransactionOptions,
  getPaymentGateway,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import * as sinon from 'sinon';

describe('Loomis Fetch Transaction API', () => {
  const LOOMIS_ROOT = '/services/loomis_api';
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  const invalidGatewayData: Array<{ testName: string; gateway: string | undefined }> = [
    { testName: 'a missing', gateway: undefined },
    { testName: 'an invalid', gateway: 'PelicanCash' },
  ];

  invalidGatewayData.forEach(({ testName, gateway }) =>
    it(`Should give an InvalidParameters error for ${testName} gateway`, async () => {
      const type = PaymentProviderTransactionType.AdvanceDisbursement;
      await request(app)
        .get(`${LOOMIS_ROOT}/transaction/${gateway}/${type}`)
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
        });
    }),
  );

  const fakeTransactionQuery: FetchTransactionOptions = {
    type: PaymentProviderTransactionType.AdvanceDisbursement,
    referenceId: 'pelican-123',
    daveUserId: 123,
    withoutFullDehydrate: true,
  };

  const fakeTransaction: PaymentProviderTransaction = {
    externalId: 'pelican',
    referenceId: 'pelican-123',
    amount: 52.44,
    gateway: PaymentGateway.BankOfDave,
    processor: PaymentProcessor.BankOfDave,
    reversalStatus: null,
    status: PaymentProviderTransactionStatus.Pending,
  };

  [PaymentGateway.Tabapay, PaymentGateway.Synapsepay, PaymentGateway.BankOfDave].forEach(
    gatewayName =>
      it(`should serialize the parameters and call fetchTransaction [${gatewayName}]`, async () => {
        const rawGateway = getGateway(gatewayName);
        const gatewayStub = sandbox.stub(rawGateway, 'fetchTransaction').resolves(fakeTransaction);

        const gateway = getPaymentGateway(gatewayName);
        const result = await gateway.fetchTransaction(fakeTransactionQuery);

        expect(result).to.deep.equal(fakeTransaction);
        expect(gatewayStub).to.have.been.calledWith(fakeTransactionQuery);
      }),
  );
});
