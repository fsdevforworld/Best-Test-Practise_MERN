import { expect } from 'chai';
import * as nock from 'nock';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import { clean, up, stubLoomisClient } from '../../test-helpers';
import * as config from 'config';
import { fetchEmpyrAuth, fetchOffers } from '../../../src/domain/rewards';
import {
  fetchAndUpdatePaymentMethod,
  validateAndFetchUser,
} from '../../../src/domain/rewards/save-empyr-event';
import User from '../../../src/models/user';
import redisClient from '../../../src/lib/redis';
import { EmpyrConfig, EmpyrEventTransaction } from '../../../src/typings/empyr';
import * as offerResponse from '../../fixtures/empyr/offers/success.json';
import * as offerResponseWithDistance from '../../fixtures/empyr/offers/successWithDistance.json';
import * as offerResponseWithLink from '../../fixtures/empyr/offers/successWithCTA.json';
import * as emptyOfferResponse from '../../fixtures/empyr/offers/empty.json';
import * as authResponse from '../../fixtures/empyr/auth/success.json';

// This is ghetto but I couldn't figure out a better way to avoid a TSC error on line 42
const authResponseData: any = authResponse;
const empyrConfig: EmpyrConfig = config.get('empyr');

describe('fetchRewardsHelpers', () => {
  const sandbox = sinon.createSandbox();
  const expectedUserId = 1;
  const expectedUserToken = `${expectedUserId}-dave-user@dave.com`;

  before(() => clean());

  beforeEach(() => {
    nock(empyrConfig.url)
      .get('/oauth/token')
      .query({
        client_id: empyrConfig.clientId,
        grant_type: 'client_usertoken',
        client_secret: empyrConfig.clientSecret,
        user_token: expectedUserToken,
      })
      .reply(200, authResponse);

    stubLoomisClient(sandbox);

    return up();
  });

  afterEach(() => clean(sandbox));

  describe('fetchAndUpdatePaymentMethod', () => {
    it('fetches payment methods including deleted', async () => {
      const expectedEmpyrCardId = 1234;
      const expectedDeletedPaymentMethod = await factory.create('payment-method', {
        userId: expectedUserId,
        empyrCardId: expectedEmpyrCardId,
        deleted: moment().utc(),
      });

      const result = await fetchAndUpdatePaymentMethod(
        expectedUserId,
        expectedEmpyrCardId,
        expectedDeletedPaymentMethod.mask,
      );

      expect(result.id).to.equal(expectedDeletedPaymentMethod.id);
    });

    it('matches on last 4 and updates empyr card id', async () => {
      const expectedEmpyrCardId = 1234;
      const expectedPaymentMethod = await factory.create('payment-method', {
        empyrCardId: null,
        userId: expectedUserId,
        mask: '1234',
      });

      const result = await fetchAndUpdatePaymentMethod(
        expectedUserId,
        expectedEmpyrCardId,
        expectedPaymentMethod.mask,
      );

      expect(result.id).to.equal(expectedPaymentMethod.id);
      expect(result.empyrCardId).to.equal(expectedEmpyrCardId);
    });
  });

  describe('validateAndFetchUser', () => {
    it('parses Empyr email into user id fetches user and updates empyrUserId', async () => {
      const expectedEmpyrUserId = 1234;
      const dummyTransaction: EmpyrEventTransaction = {
        id: 1234,
        user: {
          id: expectedEmpyrUserId,
          email: '4567-dave-user@dave.com',
        },
      } as EmpyrEventTransaction;

      const expectedDeletedUser = await factory.create('user', {
        id: 4567,
        deleted: moment().utc(),
      });

      const result = await validateAndFetchUser(expectedEmpyrUserId, dummyTransaction);

      expect(result.id).to.equal(expectedDeletedUser.id);
      expect(result.empyrUserId).to.equal(expectedEmpyrUserId);
    });
  });

  describe('fetchEmpyrAuth()', () => {
    it('returns auth payload', async () => {
      const fakeUser: Partial<User> = {
        id: expectedUserId,
      };

      const result = await fetchEmpyrAuth(fakeUser.id);

      const expectedResult = expectedUserToken;

      const expectedAccessToken = authResponseData.access_token;

      expect(result.userToken).to.equal(expectedResult);
      expect(result.accessToken).to.equal(expectedAccessToken);
    });

    it('returns data from cache if available', async () => {
      const redisSandbox = sinon.createSandbox();

      const expectedResult = {
        userToken: 'userToken',
        accessToken: 'accessToken',
        clientId: 'clientId',
      };

      const redisStub = redisSandbox
        .stub(redisClient, 'getAsync' as any)
        .returns(JSON.stringify(expectedResult));

      const result = await fetchEmpyrAuth(expectedUserId);

      const getAsyncSpy: SinonStub = redisClient.getAsync as SinonStub;

      redisStub.restore();

      expect(getAsyncSpy.called);
      expect(result).to.deep.equal(expectedResult);

      redisSandbox.restore();
    });
  });

  describe('fetchOffers()', () => {
    it('returns hasActivated set correctly for click to activate offers', async () => {
      const fakeUser: Partial<User> = {
        id: expectedUserId,
      };

      // Because the calls that we are trying to mock out use multipart form data nock.back won't work out of the box. Multipart form
      // data includes a timestamp that changes on each request so the fixtures won't be matched
      nock(empyrConfig.url)
        .post('/api/v2/venues/search')
        .query({
          client_id: empyrConfig.clientId,
        })
        .reply(200, offerResponseWithLink);

      const results = await fetchOffers(fakeUser.id, null, null, null, 34.0522255, -118.3512037);

      expect(results.offers[0].offers[0].hasActivated).to.be.true; // tslint:disable-line no-unused-expression
      expect(results.offers[1].offers[0].hasActivated).to.be.false; // tslint:disable-line no-unused-expression
    });

    it('calculates distance from a location using userLatitude and userLongitude', async () => {
      const fakeUser: Partial<User> = {
        id: expectedUserId,
      };

      // Because the calls that we are trying to mock out use multipart form data nock.back won't work out of the box. Multipart form
      // data includes a timestamp that changes on each request so the fixtures won't be matched
      nock(empyrConfig.url)
        .post('/api/v2/venues/search')
        .query({
          client_id: empyrConfig.clientId,
        })
        .reply(200, offerResponseWithDistance);

      const results = await fetchOffers(fakeUser.id, null, null, null, 34.0522255, -118.3512037);

      expect(results.offers[0].distance).to.equal(1.6);
    });

    it('returns up to 50 offers', async () => {
      const fakeUser: Partial<User> = {
        id: expectedUserId,
        zipCode: '90292',
      };

      const expectedResult: any = {
        offers: [
          {
            id: 1622,
            name: "Lenzini's Pizza",
            primaryCategory: 'Pizza',
            categories: ['Pizza'],
            rating: 3.13,
            ratingCount: 47,
            address: '4222 Lincoln Blvd, Marina Del Rey, CA 90292',
            phoneNumber: '(310) 305-0300',
            distance: undefined,
            thumbnailUrl:
              'https://d10ukqbetc2okm.cloudfront.net/images/business/1622/lenzini-s-pizza1600567256-thumb.jpg',
            offers: [
              {
                id: 1572,
                requiresActivation: false,
                freeMonthSpendRate: 10,
                rewardType: 'PERCENT',
                hasActivated: true,
                finePrint:
                  'Not all cards are eligible and not all transactions can be monitored. For debit cards, run transaction as credit, do not use PIN. Offer valid from 04/13/2012. Maximum individual reward 250 dollars.',
              },
            ],
            images: [
              'https://d10ukqbetc2okm.cloudfront.net/imagesr/w-960_h-640/business/1622/lenzini-s-pizza1693211384.jpg',
              'https://d10ukqbetc2okm.cloudfront.net/imagesr/w-960_h-640/business/1622/lenzini-s-pizza2082429953.jpg',
              'https://d10ukqbetc2okm.cloudfront.net/imagesr/w-960_h-640/business/1622/lenzini-s-pizza1719749395.jpg',
              'https://d10ukqbetc2okm.cloudfront.net/imagesr/w-960_h-640/business/1622/lenzini-s-pizza761445293.jpg',
              'https://d10ukqbetc2okm.cloudfront.net/imagesr/w-960_h-640/business/1622/lenzini-s-pizza1258977899.jpg',
            ],
          },
        ],
        userReward: {
          membershipsEarned: 0,
          progress: 0,
        },
      };

      const expectedAuthResult = {
        clientId: empyrConfig.clientId,
        userToken: expectedUserToken,
      };

      // Because the calls that we are trying to mock out use multipart form data nock.back won't work out of the box. Multipart form
      // data includes a timestamp that changes on each request so the fixtures won't be matched
      nock(empyrConfig.url)
        .post('/api/v2/venues/search')
        .query({
          client_id: empyrConfig.clientId,
        })
        .reply(200, offerResponse);

      const results = await fetchOffers(fakeUser.id, fakeUser.zipCode);

      expect(results.offers[0]).to.deep.equal(expectedResult.offers[0]);
      expect(results.auth).to.deep.equal(expectedAuthResult);
      expect(results.offers.length).to.equal(50);

      expect(results.userReward).to.deep.equal(expectedResult.userReward);

      // Ensure the image urls have been converted to valid ones per the Empyr spec
      results.offers.forEach((result: any) => {
        expect(result.offers[0].freeMonthSpendRate).to.equal(10);
        expect(result.thumbnailUrl).to.not.match(/https:\/\/test.mogl.com:444/);
      });
    });

    it('handles no results', async () => {
      const fakeUser: Partial<User> = {
        id: expectedUserId,
        zipCode: '99514',
      };

      // Because the calls that we are trying to mock out use multipart form data nock.back won't work out of the box. Multipart form
      // data includes a timestamp that changes on each request so the fixtures won't be matched
      nock(empyrConfig.url)
        .post('/api/v2/venues/search')
        .query({
          client_id: empyrConfig.clientId,
        })
        .reply(200, emptyOfferResponse);

      const results = await fetchOffers(fakeUser.id, fakeUser.zipCode);

      expect(results.offers.length).to.equal(0);
    });
  });
});
