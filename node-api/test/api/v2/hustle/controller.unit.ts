import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import {
  HustleCategory,
  HustlePartner,
  HustleSortOrder,
  HustleSearchResponse,
} from '@dave-inc/wire-typings';
import * as HustleController from '../../../../src/api/v2/hustle/controller';
import * as HustleService from '../../../../src/domain/hustle';
import { InvalidParametersError } from '../../../../src/lib/error';
import { IDaveRequest } from '../../../../src/typings';
/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');
import { HustleSearchResult } from '../../../../src/domain/hustle/types';

describe('Hustle Controller', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  const emptyHustleSearchResult: HustleSearchResult = {
    page: 0,
    totalPages: 0,
    hustles: [],
  };

  describe('search', () => {
    it('returns Hustles from search as HustleSearchResponse', async () => {
      const daveHustle: HustleService.Hustle = {
        name: 'Lyft Driver',
        company: 'Lyft',
        postedDate: null,
        description: 'Driving for Lyft in a pink car.',
        affiliateLink: 'https://www.lyft.com',
        category: HustleCategory.TRANSPORTATION,
        externalId: '123',
        hustlePartner: HustlePartner.Dave,
        isActive: true,
        city: null,
        state: null,
        logo: 'https://logo.com',
      };
      const expectedHustleSearchResponse: HustleSearchResponse = {
        page: 0,
        totalPages: 1,
        hustles: [
          {
            hustleId: `${HustlePartner.Dave}|123`,
            name: 'Lyft Driver',
            company: 'Lyft',
            city: null,
          },
        ],
      };
      sandbox
        .stub(HustleService, 'searchHustles')
        .resolves({ page: 0, totalPages: 1, hustles: [daveHustle] });

      const hustleResponse = await HustleController.search(
        new MockExpressRequest({ body: {}, query: { keyword: 'abde' } }) as IDaveRequest,
      );

      expect(hustleResponse).to.deep.equal(expectedHustleSearchResponse);
    });
  });

  describe('get', () => {
    it('should return a HustleResponse', async () => {
      const externalId = 'ABC-123';
      const hustleId = `${HustlePartner.Appcast}|${externalId}`;
      const hustle: HustleService.Hustle = {
        name: 'job name',
        company: 'job company',
        description: 'job description',
        postedDate: moment(),
        affiliateLink: 'link',
        logo: 'logo',
        city: 'city',
        state: 'state',
        isActive: true,
        category: HustleCategory.ANIMAL_SERVICES,
        hustlePartner: HustlePartner.Appcast,
        externalId,
      };
      const expectedHustleResponse = {
        hustleId,
        logo: hustle.logo,
        name: hustle.name,
        company: hustle.company,
        city: hustle.city,
        state: hustle.state,
        category: hustle.category,
        affiliateLink: hustle.affiliateLink,
        postedDate: hustle.postedDate.format('YYYY-MM-DD'),
        description: hustle.description,
      };
      sandbox.stub(HustleService, 'getHustle').resolves(hustle);
      const hustleResponse = await HustleController.get(
        new MockExpressRequest({ body: {}, params: { hustleId } }) as IDaveRequest,
      );
      expect(hustleResponse).to.eql(expectedHustleResponse);
    });

    it('should throw an InvalidParametersError if no hustleId is provided', async () => {
      await expect(
        HustleController.get(
          new MockExpressRequest({ body: {}, params: { hustleId: undefined } }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });
  });

  describe('HustleSearchCriteria', () => {
    it('extracts keywords delimited by + from query params', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        keywords: ['We', 'could', 'have', 'had', 'it', 'all'],
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { keyword: 'We+could+have+had+it+all' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('extracts keywords delimited by %20 from query params', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        keywords: ['Rolling', 'in', 'the', 'deep'],
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { keyword: 'Rolling%20in%20the%20deep' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('extracts category from query params', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        keywords: ['Rolling', 'in', 'the', 'deep'],
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { keyword: 'Rolling%20in%20the%20deep' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('extract literal string category from query params', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        category: HustleCategory.CUSTOMER_SERVICE,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { category: 'Customer Service' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('extract multi-word category from query params with + for spaces', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        category: HustleCategory.MILITARY_HEALTHCARE,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { category: 'Military+Healthcare' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('extract multi-word category from query params with %20 for spaces', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        category: HustleCategory.MILITARY_HEALTHCARE,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { category: 'Military%20Healthcare' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('searching for invalid categories results in an InvalidHustleSearch error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { category: 'Gobbledygook Soup' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('valid lat / long from the query will be used in the search criteria', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '38.2324',
        long: '-122.6367', // petaluma, home of Lagunitas IPA
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '38.2324', long: '-122.6367' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('receiving a lat but no long in the query causes a failure', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', keyword: 'Goonies' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('receiving a long but no lat in the query causes a failure', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { long: '-122.6367', keyword: 'neversaydie' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('valid radius with the lat/long in the query will be used in the search criteria', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '38.2324',
        long: '-122.6367', // petaluma, home of Lagunitas IPA
        radius: 42,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '38.2324', long: '-122.6367', radius: '42' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('valid radius with integer lat/long in the query will be used in the search criteria', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '0',
        long: '-180',
        radius: 25,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '0', long: '-180', radius: '25' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('decimal portion of radius is ignored in the search criteria', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '38.2324',
        long: '-122.6367', // petaluma, home of Lagunitas IPA
        radius: 3,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '38.2324', long: '-122.6367', radius: '3.14159' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('receiving an invalid radius with a lat long in the query causes a failure', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', long: '-122.6367', radius: 'goop', keyword: 'neversaydie' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('receiving a negative radius with a lat long in the query causes a failure', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', long: '-122.6367', radius: '-25', keyword: 'neversaydie' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('receiving a radius without a lat long in the query causes a failure', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { radius: '17', keyword: 'neversaydie' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('invalid lat from the query will be used in the search criteria', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '12.2.64-67', long: '-122.6367' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('invalid long from the query will be used in the search criteria', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', long: 'abcde' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('provider in query string will be used in search criteria', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        hustlePartner: HustlePartner.Appcast,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { partner: HustlePartner.Appcast },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('searching for invalid partner results in an InvalidHustleSearch error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { partner: 'GoogleJobs' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('searching requires at least one criteria', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: {},
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('search can be sorted by posted date', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        postedDateSort: HustleSortOrder.ASC,
        keywords: ['random'],
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { keyword: 'random', posted_date_sort: 'asc' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('invalid posted_date_sort value results in an error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { keyword: 'random', posted_date_sort: 'notarealvalue' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('random posted_date_sort value results in an error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { keyword: 'random', posted_date_sort: 'random' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('search can be sorted by location distance', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '38.2324',
        long: '-122.6367', // petaluma, home of Lagunitas IPA
        distanceSort: HustleSortOrder.DESC,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '38.2324', long: '-122.6367', distance_sort: 'desc' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('invalid distance_sort value returns an error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', long: '-122.6367', distance_sort: 'none' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('random distance_sort value returns an error', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { lat: '38.2324', long: '-122.6367', distance_sort: 'random' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('including distance_sort param when without lat/long returns an error.', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { keyword: 'random', distance_sort: 'asc' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('including multiple sort types is an error.', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: {
              lat: '38.2324',
              long: '-122.6367',
              distance_sort: 'asc',
              posted_date_sort: 'desc',
            },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('A page number in the query tries fetching a specific page.', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '33.1156',
        long: '-117.1202', // Escondido, CA headquarters of Stone Brewing Company
        page: 7,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '33.1156', long: '-117.1202', page: '7' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('Requesting page 0 returns a page.', async () => {
      const hustleServiceStub = sandbox
        .stub(HustleService, 'searchHustles')
        .resolves(emptyHustleSearchResult);
      const expectedSearchCriteria: HustleService.HustleSearchCriteria = {
        lat: '33.1156',
        long: '-117.1202', // Escondido, CA headquarters of Stone Brewing Company
        page: 0,
      };

      await HustleController.search(
        new MockExpressRequest({
          body: {},
          query: { lat: '33.1156', long: '-117.1202', page: '0' },
        }) as IDaveRequest,
      );

      sandbox.assert.calledWithExactly(hustleServiceStub, expectedSearchCriteria);
    });

    it('Requesting a negative page number produces an error ', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { keyword: 'random', page: '-1' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });

    it('Requesting a non numeric page number produces an error ', async () => {
      sandbox.stub(HustleService, 'searchHustles').resolves(emptyHustleSearchResult);
      await expect(
        HustleController.search(
          new MockExpressRequest({
            body: {},
            query: { keyword: 'random', page: 'wonky' },
          }) as IDaveRequest,
        ),
      ).to.be.rejectedWith(InvalidParametersError);
    });
  });
});
