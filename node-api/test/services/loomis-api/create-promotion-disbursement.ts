import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import { getGateway } from '../../../src/domain/payment-provider';
import app from '../../../src/services/loomis-api';
import { BankAccountSubtype, BankAccountType, BankingDataSource } from '@dave-inc/wire-typings';
import {
  PaymentGateway,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import * as sinon from 'sinon';
import factory from '../../factories';

describe('Loomis Create Promotion Disbursement API', () => {
  const LOOMIS_ROUTE = '/services/loomis_api/disburse_promotion';
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should correctly call create transaction', async () => {
    const { id: userId } = await factory.create('user');

    const bankConnection = await factory.create('bank-connection', {
      userId,
      bankingDataSource: BankingDataSource.Plaid,
      externalId: 'bankConnectionExternalId',
    });
    const { id: bankConnectionId, externalId: bankConnectionExternalId } = bankConnection;
    const bankAccount = await factory.create('bank-account', {
      userId,
      bankConnectionId,
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });
    await bankConnection.update(bankConnection, { bankAccounts: [bankAccount] });

    const rawGateway = getGateway(PaymentGateway.Synapsepay);
    const fakeRequest = {
      amountInCents: 1000,
      bankConnectionExternalId,
    };
    const fakeResponse = {
      externalId: bankConnectionExternalId,
      referenceId: 'referenceId',
      amount: 10,
      gateway: PaymentGateway.Synapsepay,
      status: PaymentProviderTransactionStatus.Completed,
      type: PaymentProviderTransactionType.PromotionDisbursement,
    };
    const gatewayStub = sandbox.stub(rawGateway, 'createTransaction').resolves(fakeResponse);
    await request(app)
      .post(LOOMIS_ROUTE)
      .send(fakeRequest)
      .expect(200)
      .then(response => {
        expect(response.body).to.deep.equal(fakeResponse);
      });
    expect(gatewayStub).to.have.been.calledOnce;
  });

  it('should return 405 (unsupported) if receives Dave Banking account', async () => {
    const { id: userId } = await factory.create('user');
    const bankConnection = await factory.create('bank-connection', {
      userId,
      bankingDataSource: BankingDataSource.BankOfDave,
      externalId: 'bankConnectionExternalId',
    });
    const { id: bankConnectionId, externalId: bankConnectionExternalId } = bankConnection;
    const bankAccount = await factory.create('bank-account', {
      userId,
      bankConnectionId,
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });
    await bankConnection.update(bankConnection, { bankAccounts: [bankAccount] });

    const fakeRequest = {
      amountInCents: 1000,
      bankConnectionExternalId,
    };
    await request(app)
      .post(LOOMIS_ROUTE)
      .send(fakeRequest)
      .expect(405);
  });
});
