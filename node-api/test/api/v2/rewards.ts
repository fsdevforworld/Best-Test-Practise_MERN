import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import * as config from 'config';
import * as crypto from 'crypto';
import * as _ from 'lodash';
import { moment } from '@dave-inc/time-lib';
import * as request from 'supertest';
import { expect } from 'chai';
import app from '../../../src/api';
import { clean, stubLoomisClient } from '../../test-helpers';
import * as rewardsHelper from '../../../src/domain/rewards';
import factory from '../../factories';
import { AnalyticsEvent, EmpyrConfig } from '../../../src/typings';
import * as authorizedSample from '../../fixtures/empyr/rewards/authorized.json';
import * as authorized2Sample from '../../fixtures/empyr/rewards/authorized2.json';
import * as clearedSample from '../../fixtures/empyr/rewards/cleared.json';
import * as removedSample from '../../fixtures/empyr/rewards/removed.json';
import * as removedDupSample from '../../fixtures/empyr/rewards/removed-dup.json';
import { EmpyrEvent, RewardsLedger } from '../../../src/models';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import { EmpyrEventType } from '@dave-inc/wire-typings';

describe('/v2/rewards', () => {
  const sandbox = sinon.createSandbox();
  const empyrConfig: EmpyrConfig = config.get('empyr');

  // Simulate Empyr signing it's JSON payload
  function signPayload(payload: any) {
    const bufferPayload = Buffer.from(JSON.stringify(payload));
    const signedPayload = crypto
      .createHmac('sha256', empyrConfig.clientSecret)
      .update(bufferPayload)
      .digest('hex');

    return signedPayload;
  }

  let fetchEmpyrAuthStub: SinonStub;
  let fetchOffersStub: SinonStub;
  let amplitudeTrackStub: SinonStub;

  before(() => clean());

  beforeEach(() => {
    fetchEmpyrAuthStub = sandbox.stub(rewardsHelper, 'fetchEmpyrAuth');
    fetchOffersStub = sandbox.stub(rewardsHelper, 'fetchOffers');
    amplitudeTrackStub = sandbox.stub(amplitude, 'track').resolves();
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('POST rewards', () => {
    it('throws an error when an invalid signature is sent', async () => {
      const expectedPayload: any = authorizedSample;
      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', 'invalid signature')
        .send(authorizedSample);

      expect(response.status).to.equal(403);
    });

    it('throws error when payment method and user do not match', async () => {
      const expectedPayload: any = authorizedSample;

      await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      expect(response.status).to.equal(400);
    });

    it('throws error when user not found', async () => {
      const expectedPayload: any = authorizedSample;
      await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      expect(response.status).to.equal(400);
    });

    it('throws error when payment method not found', async () => {
      const expectedPayload: any = authorizedSample;
      await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      expect(response.status).to.equal(400);
    });

    it('does not throw error when payment method match found on last 4', async () => {
      const expectedPayload: any = authorized2Sample;

      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });

      await factory.create('payment-method', {
        mask: expectedPayload.transaction.last4,
        userId: expectedUser.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      expect(response.status).to.equal(200);
    });

    it('returns 200 when duplicate transaction received, does not save', async () => {
      const expectedPayload: any = authorizedSample;

      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const originalTransaction = await factory.create('empyr-event', {
        transactionId: expectedPayload.transaction.id,
        userId: expectedUser.id,
        paymentMethodId: expectedPaymentMethod.id,
        cardId: expectedPayload.transaction.cardId,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(authorizedSample);

      const resultEvents = await EmpyrEvent.findAll({
        where: {
          transactionId: originalTransaction.transactionId,
        },
      });

      expect(resultEvents.length).to.equal(1);
      expect(response.status).to.equal(200);
    });

    it('successfully saves transaction with AUTHORIZED payload', async () => {
      const expectedPayload: any = authorizedSample;
      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(authorizedSample);

      const resultEvent = await EmpyrEvent.findOne({
        where: {
          userId: expectedUser.id,
          paymentMethodId: expectedPaymentMethod.id,
        },
      });

      expect(amplitudeTrackStub).to.have.callCount(1);
      expect(amplitudeTrackStub.firstCall.args[0]).to.deep.equal({
        userId: expectedUser.id,
        eventType: AnalyticsEvent.RewardTransactionAuthorized,
        eventProperties: {
          authorizedAmount: expectedPayload.transaction.authorizationAmount,
          city: expectedPayload.transaction.venue.address.city,
          commission: _.sumBy(expectedPayload.transaction.redemptions, 'publisherCommission'),
          merchantName: expectedPayload.transaction.venue.name,
          rewardAmount: expectedPayload.transaction.cashbackAmount,
          state: expectedPayload.transaction.venue.address.state,
        },
      });

      // AUTHORIZED payloads do not update rewards ledger
      const ledger = await RewardsLedger.findAll();
      expect(ledger.length).to.equal(0);
      expect(response.status).to.equal(200);
      expect(resultEvent.eventType).to.equal(EmpyrEventType.AUTHORIZED);
      expect(resultEvent.transactionId).to.equal(expectedPayload.transaction.id);
      expect(resultEvent.cardId).to.equal(expectedPayload.transaction.cardId);
      expect(resultEvent.authorizedAmount).to.equal(
        expectedPayload.transaction.authorizationAmount,
      );
      expect(resultEvent.clearedAmount).to.equal(expectedPayload.transaction.clearingAmount);
      expect(resultEvent.rewardAmount).to.equal(
        _.round(expectedPayload.transaction.cashbackAmount, 2),
      );
      expect(resultEvent.commission).to.equal(
        _.round(_.sumBy(expectedPayload.transaction.redemptions, 'publisherCommission'), 2),
      );
    });

    it('successfully saves transaction with CLEARED payload', async () => {
      const expectedPayload: any = clearedSample;
      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const brazeTrackStub = sandbox.stub(braze, 'track').resolves();
      const billingStart = moment().startOf('month');
      const billingEnd = moment().endOf('month');

      await factory.create('subscription-billing', {
        userId: expectedUser.id,
        start: billingStart.format('YYYY-MM-DD HH:mm:ss'),
        end: billingEnd.format('YYYY-MM-DD HH:mm:ss'),
        amount: 1.0,
        billingCycle: moment().format('YYYY-MM'),
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      const resultEvent = await EmpyrEvent.findOne({
        where: {
          userId: expectedUser.id,
          paymentMethodId: expectedPaymentMethod.id,
        },
      });

      // reward amount is $2.80, giving 2 free months, which in turn deducts $2.00 from ledger
      const ledger = await RewardsLedger.findAll().map(item => item.amount);
      const total = ledger.reduce((acc, amount) => acc + amount, 0);
      const expectedTotal = 0.05;
      expect(_.round(total, 2)).to.equal(expectedTotal);

      // analytics track events
      expect(amplitudeTrackStub).to.have.callCount(3);
      expect(brazeTrackStub).to.have.callCount(2);
      const userId = expectedUser.id;
      const eventType = 'free month earned';

      // analytics track calls for unpaid month
      let properties = {
        source: 'Rewards',
        sourceType: 'Rewards',
        month: billingStart.format('MMMM'),
      };
      expect(amplitudeTrackStub.firstCall.args[0]).to.deep.equal({
        userId,
        eventType,
        eventProperties: properties,
      });
      const brazeFirstCallArgs = brazeTrackStub.firstCall.args[0].events[0];
      expect(brazeFirstCallArgs.properties).to.deep.equal(properties);
      expect(brazeFirstCallArgs.name).to.deep.equal(eventType);
      expect(brazeFirstCallArgs.externalId).to.deep.equal(userId.toString());

      // analytics track calls for future month
      properties = {
        source: 'Rewards',
        sourceType: 'Rewards',
        month: billingStart.add(1, 'months').format('MMMM'),
      };
      expect(amplitudeTrackStub.secondCall.args[0]).to.deep.equal({
        userId,
        eventType,
        eventProperties: properties,
      });

      expect(amplitudeTrackStub.thirdCall.args[0]).to.deep.equal({
        userId: expectedUser.id,
        eventType: AnalyticsEvent.RewardTransactionCleared,
        eventProperties: {
          clearedAmount: expectedPayload.transaction.clearingAmount,
          city: expectedPayload.transaction.venue.address.city,
          commission: _.sumBy(expectedPayload.transaction.redemptions, 'publisherCommission'),
          merchantName: expectedPayload.transaction.venue.name,
          rewardAmount: expectedPayload.transaction.cashbackAmount,
          state: expectedPayload.transaction.venue.address.state,
        },
      });

      const brazeSecondCallArgs = brazeTrackStub.secondCall.args[0].events[0];
      expect(brazeSecondCallArgs.properties).to.deep.equal(properties);
      expect(brazeSecondCallArgs.name).to.deep.equal(eventType);
      expect(brazeSecondCallArgs.externalId).to.deep.equal(userId.toString());

      expect(response.status).to.equal(200);
      expect(resultEvent.transactionId).to.equal(expectedPayload.transaction.id);
      expect(resultEvent.eventType).to.equal(EmpyrEventType.CLEARED);
      expect(resultEvent.cardId).to.equal(expectedPayload.transaction.cardId);
      expect(resultEvent.authorizedAmount).to.equal(
        expectedPayload.transaction.authorizationAmount,
      );
      expect(resultEvent.clearedAmount).to.equal(expectedPayload.transaction.clearingAmount);
      expect(resultEvent.rewardAmount).to.equal(
        _.round(expectedPayload.transaction.cashbackAmount, 2),
      );
      expect(resultEvent.commission).to.equal(
        _.round(_.sumBy(expectedPayload.transaction.redemptions, 'publisherCommission'), 2),
      );
    });

    it('successfully saves transaction with REMOVED payload', async () => {
      const expectedPayload: any = removedSample;
      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      const resultEvent = await EmpyrEvent.findOne({
        where: {
          userId: expectedUser.id,
          paymentMethodId: expectedPaymentMethod.id,
        },
      });

      // No event sent to amplitude for REMOVED
      expect(amplitudeTrackStub).to.have.callCount(0);
      expect(response.status).to.equal(200);
      expect(resultEvent.transactionId).to.equal(expectedPayload.transaction.id);
      expect(resultEvent.eventType).to.equal(EmpyrEventType.REMOVED);
      expect(resultEvent.cardId).to.equal(expectedPayload.transaction.cardId);
      expect(resultEvent.authorizedAmount).to.equal(
        expectedPayload.transaction.authorizationAmount,
      );
      expect(resultEvent.clearedAmount).to.equal(expectedPayload.transaction.clearingAmount);
      expect(resultEvent.rewardAmount).to.equal(
        _.round(expectedPayload.transaction.cashbackAmount, 2),
      );
    });

    it('successfully saves transaction with REMOVED_DUP payload', async () => {
      const expectedPayload: any = removedDupSample;
      const expectedUser = await factory.create('user', {
        empyrUserId: expectedPayload.transaction.user.id,
      });
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: expectedPayload.transaction.cardId,
        userId: expectedUser.id,
      });

      const response = await request(app)
        .post('/v2/empyr_webhook/rewards')
        .set('notifysignature', signPayload(expectedPayload))
        .send(expectedPayload);

      const resultEvent = await EmpyrEvent.findOne({
        where: {
          userId: expectedUser.id,
          paymentMethodId: expectedPaymentMethod.id,
        },
      });

      expect(amplitudeTrackStub).to.have.callCount(1);
      expect(amplitudeTrackStub.firstCall.args[0]).to.deep.equal({
        userId: expectedUser.id,
        eventType: AnalyticsEvent.RewardTransactionRemovedDup,
        eventProperties: {
          clearedAmount: expectedPayload.transaction.clearingAmount,
          city: expectedPayload.transaction.venue.address.city,
          commission: _.sumBy(expectedPayload.transaction.redemptions, 'publisherCommission'),
          merchantName: expectedPayload.transaction.venue.name,
          rewardAmount: expectedPayload.transaction.cashbackAmount,
          state: expectedPayload.transaction.venue.address.state,
        },
      });

      expect(response.status).to.equal(200);
      expect(resultEvent.transactionId).to.equal(expectedPayload.transaction.id);
      expect(resultEvent.eventType).to.equal(EmpyrEventType.REMOVED_DUP);
      expect(resultEvent.cardId).to.equal(expectedPayload.transaction.cardId);
      expect(resultEvent.authorizedAmount).to.equal(
        expectedPayload.transaction.authorizationAmount,
      );
      expect(resultEvent.clearedAmount).to.equal(expectedPayload.transaction.clearingAmount);
      expect(resultEvent.rewardAmount).to.equal(
        _.round(expectedPayload.transaction.cashbackAmount, 2),
      );
    });
  });

  describe('GET offers', () => {
    it('returns offers', async () => {
      const fakeUser = await factory.create('user');
      const expectedResult = [
        {
          id: 1,
          name: 'Merchant',
          rating: 4.5,
          ratingCount: 23,
          address: '123 Stuff Ave, West Chester, PA, 19380',
          phoneNumber: '(610) 436-8899',
          thumbnailUrl: 'https://image.stuff.com',
        },
      ];

      fetchOffersStub.returns(expectedResult);

      const response = await request(app)
        .get('/v2/rewards/offers')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal(expectedResult);
    });

    it('calls fetchOffers with distance and location passed in', async () => {
      const expectedUser = await factory.create('user');

      await request(app)
        .get('/v2/rewards/offers')
        .query({
          distance: 100,
          location: '11111',
        })
        .set('Authorization', expectedUser.id)
        .set('X-Device-Id', expectedUser.id);

      expect(fetchOffersStub).to.have.been.calledWith(
        expectedUser.id,
        '11111',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '100',
      );
    });

    it('calls fetchOffers with distance, searchLatitude, and searchLongitude passed in', async () => {
      const expectedUser = await factory.create('user');

      await request(app)
        .get('/v2/rewards/offers')
        .query({
          distance: 100,
          searchLatitude: 100.2,
          searchLongitude: -34.434,
        })
        .set('Authorization', expectedUser.id)
        .set('X-Device-Id', expectedUser.id);

      expect(fetchOffersStub).to.have.been.calledWith(
        expectedUser.id,
        undefined,
        '100.2',
        '-34.434',
        undefined,
        undefined,
        undefined,
        '100',
      );
    });

    it('calls fetchOffers with all parameteres passed in', async () => {
      const expectedUser = await factory.create('user');

      await request(app)
        .get('/v2/rewards/offers')
        .query({
          distance: 100,
          location: '11111',
          searchLatitude: 100.2,
          searchLongitude: -34.434,
          userLatitude: 99.1,
          userLongitude: 100.2,
          category: 'Sushi',
        })
        .set('Authorization', expectedUser.id)
        .set('X-Device-Id', expectedUser.id);

      expect(fetchOffersStub).to.have.been.calledWith(
        expectedUser.id,
        '11111',
        '100.2',
        '-34.434',
        '99.1',
        '100.2',
        'Sushi',
        '100',
      );
    });
  });

  describe('GET auth', () => {
    it('handles exceptions by returning 404', async () => {
      fetchEmpyrAuthStub.throws(new Error('Error'));
      const fakeUser = await factory.create('user');

      const response = await request(app)
        .get('/v2/rewards/auth')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(404);
      expect(response.body.message).to.contain('No Empyr token could be fetched.');
    });

    it('returns success payload with 200 status', async () => {
      const expectedResult = {
        clientId: 'clientId',
        accessToken: 'accessToken',
        userToken: 'userToken',
      };

      fetchEmpyrAuthStub.returns(expectedResult);

      const fakeUser = await factory.create('user');

      const response = await request(app)
        .get('/v2/rewards/auth')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal(expectedResult);
    });
  });

  describe('DELETE card', () => {
    it('throws error when paymentMethodId not sent in body', async () => {
      const expectedUser = await factory.create('user');
      const response = await request(app)
        .delete('/v2/rewards/card')
        .set('Authorization', expectedUser.id.toString())
        .set('X-Device-Id', expectedUser.id.toString());

      expect(response.status).to.equal(400);
    });
  });

  describe('GET reward transactions', () => {
    it('filters out REMOVED_DUP events', async () => {
      const fakeUser = await factory.create('user');

      const expectedTransaction = await factory.create('empyr-event-cleared', {
        userId: fakeUser.id,
        created: moment(),
        transactionDate: moment(),
      });

      await factory.create('empyr-event-removed-dup', {
        userId: fakeUser.id,
      });

      const response = await request(app)
        .get('/v2/rewards/transactions')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body.rewardTransactions.length).to.equal(1);
      expect(response.body.rewardTransactions[0].id).to.equal(expectedTransaction.id);
    });

    it('filters out AUTHORIZED events with no rewards', async () => {
      const fakeUser = await factory.create('user');

      const expectedTransaction = await factory.create('empyr-event-cleared', {
        userId: fakeUser.id,
        created: moment(),
        transactionDate: moment(),
      });

      await factory.create('empyr-event-authorized', {
        userId: fakeUser.id,
        rewardAmount: 0,
        commission: 0,
      });

      const response = await request(app)
        .get('/v2/rewards/transactions')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body.rewardTransactions.length).to.equal(1);
      expect(response.body.rewardTransactions[0].id).to.equal(expectedTransaction.id);
    });

    it('returns transactions in descending order by transaction_date', async () => {
      const fakeUser = await factory.create('user');

      const oldTransaction = await factory.create('empyr-event-cleared', {
        userId: fakeUser.id,
        created: moment().subtract(1, 'days'),
        transactionDate: moment().subtract(1, 'days'),
      });

      const newTransaction = await factory.create('empyr-event-cleared', {
        userId: fakeUser.id,
        created: moment(),
        transactionDate: moment(),
      });

      const response = await request(app)
        .get('/v2/rewards/transactions')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body.rewardTransactions.length).to.equal(2);
      expect(response.body.rewardTransactions[0].id).to.equal(newTransaction.id);
      expect(response.body.rewardTransactions[1].id).to.equal(oldTransaction.id);
    });

    it('filters older transactions (by returning most recent record of those with same transaction_id)', async () => {
      const fakeUser = await factory.create('user');

      const authorizedTransaction = await factory.create('empyr-event-authorized', {
        userId: fakeUser.id,
        created: moment().subtract(1, 'days'),
      });

      const clearedTransaction = await factory.create('empyr-event-cleared', {
        id: authorizedTransaction.id + 1,
        userId: fakeUser.id,
        created: moment(),
        transactionId: authorizedTransaction.transactionId,
      });

      const response = await request(app)
        .get('/v2/rewards/transactions')
        .set('Authorization', fakeUser.id)
        .set('X-Device-Id', fakeUser.id);

      expect(response.status).to.equal(200);
      expect(response.body.rewardTransactions.length).to.equal(1);
      expect(response.body.rewardTransactions[0].id).to.equal(clearedTransaction.id);
    });
  });
});
