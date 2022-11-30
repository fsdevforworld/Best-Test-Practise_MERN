import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import { SubscriptionPayment } from '../../../src/models';
import factory from '../../factories';
import { TransactionType } from '@dave-inc/loomis-client';

describe('getSubscriptionPaymentDetails', () => {
  let payment: SubscriptionPayment;

  before(async () => {
    await clean();
    payment = await factory.create('subscription-payment');
  });

  it('throws on an invalid payment ID', async () => {
    await request(app)
      .get('/services/loomis_api/subscription_payment/pelican')
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
      });
  });

  it('retrieves a payment by ID', async () => {
    await request(app)
      .get(`/services/loomis_api/subscription_payment/${payment.id}`)
      .send()
      .expect(200)
      .then(response => {
        expect(response.body).to.contain({
          type: TransactionType.SubscriptionPayment,
          legacyPaymentId: payment.id,
          amountInCents: payment.amount * 100,
        });
      });
  });

  it('returns not_found for a missing payment', async () => {
    await request(app)
      .get(`/services/loomis_api/subscription_payment/${payment.id + 100}`)
      .send()
      .expect(404)
      .then(response => {
        expect(response.body.type).to.eq('not_found');
      });
  });
});
