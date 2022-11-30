import { expect } from 'chai';
import { omit } from 'lodash';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import { getGateway } from '../../../src/domain/payment-provider';
import app from '../../../src/services/loomis-api';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  ReversalStatus,
  ReverseTransactionOptions,
} from '@dave-inc/loomis-client';
import * as sinon from 'sinon';

describe('Loomis Reverse Transaction API', () => {
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
      const externalId = 'pelican-123-xyz';
      await request(app)
        .del(`${LOOMIS_ROOT}/transaction/${gateway}/${type}/${externalId}`)
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
          expect(response.body.message).to.contain('is not a valid gateway');
        });
    }),
  );

  const invalidTypeData: Array<{ testName: string; type: string | undefined }> = [
    { testName: 'a missing', type: undefined },
    { testName: 'an invalid', type: 'pelican-debit' },
  ];

  invalidTypeData.forEach(({ testName, type }) =>
    it(`Should give an InvalidParameters error for ${testName} gateway`, async () => {
      const gateway = PaymentGateway.Synapsepay;
      const externalId = 'pelican-123-xyz';
      await request(app)
        .del(`${LOOMIS_ROOT}/transaction/${gateway}/${type}/${externalId}`)
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
          expect(response.body.message).to.contain('Invalid transaction type:');
        });
    }),
  );

  const fakeTransactionQuery: ReverseTransactionOptions = {
    type: PaymentProviderTransactionType.SubscriptionPayment,
    externalId: 'pelican-pelican-pelican',
    correspondingId: 'pelican-corresponds',
    sourceId: 'pelican-source-id',
    ownerId: 'pelican-owner',
  };

  const fakeTransaction: PaymentProviderTransaction = {
    externalId: 'pelican-pelican-pelican',
    referenceId: 'pelican-corresponds',
    amount: 123.45,
    gateway: PaymentGateway.BankOfDave,
    processor: PaymentProcessor.BankOfDave,
    reversalStatus: ReversalStatus.Pending,
    status: PaymentProviderTransactionStatus.Completed,
  };

  it('should serialize the parameters and call reverseTransaction', async () => {
    const gatewayName = PaymentGateway.BankOfDave;
    const rawGateway = getGateway(gatewayName);

    const gatewayStub = sandbox.stub(rawGateway, 'reverseTransaction').resolves(fakeTransaction);

    await request(app)
      .del(
        `${LOOMIS_ROOT}/transaction/${gatewayName}/${fakeTransactionQuery.type}/${fakeTransactionQuery.externalId}`,
      )
      .send(omit(fakeTransactionQuery, ['type', 'externalId']))
      .expect(200)
      .then(response => {
        expect(response.body).to.deep.equal(fakeTransaction);
      });

    expect(gatewayStub).to.have.been.calledWith(fakeTransactionQuery);
  });
});
