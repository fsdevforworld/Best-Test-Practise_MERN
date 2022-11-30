import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import factory from '../../factories';
import { PaymentMethodType } from '@dave-inc/loomis-client';

describe('getBankAccountDetails', () => {
  before(async () => {
    await clean();
  });

  afterEach(() => clean());

  it('should throw on an invalid bank account ID', async () => {
    await request(app)
      .get('/services/loomis_api/bank_account/invalidID')
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('Invalid bank account ID');
      });
  });

  it('should retrieve a bank account by ID', async () => {
    const bankAccount = await factory.create('bank-account');

    await request(app)
      .get(`/services/loomis_api/bank_account/${bankAccount.id}`)
      .send()
      .expect(200)
      .then(response => {
        expect(response.body.type).to.eq(PaymentMethodType.BANK_ACCOUNT);
        expect(response.body.universalId).to.exist;
      });
  });

  it('should retrieve a bank account by externalId', async () => {
    const bankAccount = await factory.create('bank-account');

    await request(app)
      .get(`/services/loomis_api/bank_account`)
      .query({ externalId: bankAccount.externalId })
      .send()
      .expect(200)
      .then(response => {
        expect(response.body.type).to.eq(PaymentMethodType.BANK_ACCOUNT);
        expect(response.body.universalId).to.exist;
      });
  });

  it('should return not_found for a missing bank account', async () => {
    await request(app)
      .get('/services/loomis_api/bank_account/123456')
      .send()
      .expect(404)
      .then(response => {
        expect(response.body.type).to.eq('not_found');
      });
  });
});
