import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import { Payment } from '../../../src/models';
import factory from '../../factories';

describe('Loomis Get Payments', () => {
  before(() => clean());
  after(() => clean());

  describe('getPayments', () => {
    let payment: Payment;
    let userId: number;
    let advanceId: number;

    before(async () => {
      const amount = 75;

      const user = await factory.create('user');
      userId = user.id;
      payment = await factory.create('payment', { amount, userId });
      advanceId = payment.advanceId;
    });

    it('returns 400 on missing userId and advanceId', async () => {
      await request(app)
        .get('/services/loomis_api/payments')
        .send()
        .expect(400)
        .then(response => {
          expect(response.body.type).to.eq('invalid_parameters');
        });
    });

    it('returns payments with valid userId', async () => {
      await request(app)
        .get('/services/loomis_api/payments')
        .query({ userId })
        .send()
        .expect(200)
        .then(response => {
          expect(response.body.length).to.eq(1);
          expect(response.body[0].legacyPaymentId).to.eq(payment.id);
        });
    });

    it('returns payments with valid advanceId', async () => {
      await request(app)
        .get('/services/loomis_api/payments')
        .query({ advanceId })
        .send()
        .expect(200)
        .then(response => {
          expect(response.body.length).to.eq(1);
          expect(response.body[0].advanceId).to.eq(payment.advanceId);
        });
    });

    it('returns payments with valid userId and advanceId', async () => {
      await request(app)
        .get('/services/loomis_api/payments')
        .query({ advanceId })
        .send()
        .expect(200)
        .then(response => {
          expect(response.body.length).to.eq(1);
          expect(response.body[0].advanceId).to.eq(payment.advanceId);
        });
    });

    it('returns 404 with valid userId and advanceId and no records', async () => {
      await request(app)
        .get('/services/loomis_api/payments')
        .query({ userId: 'invalid', advanceId: 0 })
        .send()
        .expect(404);
    });
  });
});
