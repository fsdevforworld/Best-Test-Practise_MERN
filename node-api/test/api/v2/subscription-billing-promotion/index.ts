import * as request from 'supertest';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean, fakeDate } from '../../../test-helpers';
import app from '../../../../src/api';
import braze from '../../../../src/lib/braze';

describe('/v2/subscription_billing_promotions', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('GET /v2/subscription_billing_promotion', () => {
    it('should include only the SubscriptionBillingPromotions that the user has not redeemed', async () => {
      const [
        user,
        subscriptionBillingPromotion,
        otherSubscriptionBillingPromotion,
      ] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
        factory.create('subscription-billing-promotion', {
          description: '4 Free Months',
          code: '4FreeMonths',
          months: 4,
        }),
      ]);

      await factory.create('redeemed-subscription-billing-promotion', {
        userId: user.id,
        subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
      });

      const response = await request(app)
        .get('/v2/subscription_billing_promotions')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send()
        .expect(200);

      expect(response.body.length).to.be.eq(1);
      expect(response.body[0].id).to.be.eq(otherSubscriptionBillingPromotion.id);
    });
  });

  describe('POST /v2/subscription_billing_promotion', () => {
    it('should return the remaining subscription billing promotion', async () => {
      const brazeStub = sandbox.stub(braze, 'track').resolves(true);

      const [
        user,
        subscriptionBillingPromotion,
        otherSubscriptionBillingPromotion,
      ] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
        factory.create('subscription-billing-promotion', {
          description: '4 Free Months',
          code: '4FreeMonths',
          months: 4,
        }),
      ]);
      fakeDate(sandbox, '2020-01-15');

      const [billing, payment] = await Promise.all([
        factory.create('subscription-billing', {
          userId: user.id,
        }),
        factory.create('subscription-payment', {
          userId: user.id,
        }),
      ]);

      await factory.create('subscription-payment-line-item', {
        subscriptionBillingId: billing.id,
        subscriptionPaymentId: payment.id,
      });

      const response = await request(app)
        .post(`/v2/subscription_billing_promotion/${subscriptionBillingPromotion.code}/redeem`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send()
        .expect(200);
      expect(brazeStub).to.have.callCount(3);

      expect(response.body.length).to.be.eq(1);
      expect(response.body[0].id).to.be.eq(otherSubscriptionBillingPromotion.id);
    });

    it('should throw a Not Found Error if promo code passed does not match a SubscriptionBillingPromotion', async () => {
      const user = await factory.create('user');

      const result = await request(app)
        .post('/v2/subscription_billing_promotion/JEFF_PROMO/redeem')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send();

      expect(result.status).to.be.equal(404);
      expect(result.body.message).to.match(/This promotion you tried to trigger does not exist\./);
    });

    it('should throw a Conflict Error if the the promo code passed has already been redeemed', async () => {
      const [user, subscriptionBillingPromotion] = await Promise.all([
        factory.create('user', {}, { hasSession: true }),
        factory.create('subscription-billing-promotion', {
          description: '3 Free Months',
          code: '3FreeMonths',
          months: 3,
        }),
      ]);

      await factory.create('redeemed-subscription-billing-promotion', {
        userId: user.id,
        subscriptionBillingPromotionId: subscriptionBillingPromotion.id,
      });

      const result = await request(app)
        .post(`/v2/subscription_billing_promotion/${subscriptionBillingPromotion.code}/redeem`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send();

      expect(result.status).to.be.equal(409);
      expect(result.body.message).to.match(/User has already redeemed this promotion\./);
    });
  });
});
