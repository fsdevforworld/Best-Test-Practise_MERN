import {
  HustleResponse,
  HustleCategory,
  HustlePartner,
  HustleSearchResponse,
  HustleCategoryResponse,
  HustleJobPackResponse,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import {
  clean,
  fakeDateTime,
  replayHttp,
  createHustleIdFromSideHustle,
  getHustleIdForSavedJob,
} from '../../../test-helpers';
import factory from '../../../factories';
import app from '../../../../src/api';
import { User, SideHustle, SideHustleSavedJob } from '../../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { constructJobIdStrings } from '../../../../src/domain/hustle/utils';
import AppcastClient from '../../../../src/lib/appcast';
import * as HustleService from '../../../../src/domain/hustle';

describe('/v2/hustles/*', () => {
  const sandbox = sinon.createSandbox();
  let user: User;
  let daveHustle: SideHustle;
  let otherDaveHustle: SideHustle;
  let appcastHustle: SideHustle;

  after(() => clean(sandbox));

  describe('GET /v2/hustles/:hustleId', () => {
    before(async () => {
      await clean(sandbox);
      const [userFromPromise, daveJob] = await Promise.all([
        factory.create('user'),
        factory.create('dave-hustle'),
      ]);
      const otherDaveJob = await factory.create('dave-hustle', {
        name: 'Customer Associate',
        description: 'Sales job with good benefits and flexible hours.',
        externalId: 'supersales',
        sideHustleCategoryId: factory.assoc('retail-hustle-category', 'id'),
      });
      user = userFromPromise;
      daveHustle = daveJob;
      otherDaveHustle = otherDaveJob;
    });

    after(() => clean(sandbox));

    it('should return a Dave HustleResponse with status 200 OK', async () => {
      const hustleId = `${HustlePartner.Dave}|${daveHustle.externalId}`;
      const expectedHustleResponse: HustleResponse = {
        hustleId,
        logo: daveHustle.logo,
        name: daveHustle.name,
        company: daveHustle.company,
        city: null,
        state: null,
        category: HustleCategory.TRANSPORTATION,
        affiliateLink: daveHustle.affiliateLink,
        postedDate: null,
        description: daveHustle.description,
      };
      const response = await request(app)
        .get(`/v2/hustles/${hustleId}`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(200);
      expect(response.body).to.eql(expectedHustleResponse);
    });

    it(
      'should return an Appcast HustleResponse with status 200 OK',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const externalId = '6721_2262-4016cfcbc087b68698af5cd55826d666';
        const hustleId = `${HustlePartner.Appcast}|${externalId}`;
        const response = await request(app)
          .get(`/v2/hustles/${hustleId}`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleResponse = {
          hustleId,
          logo: 'https://logo.appcast.io/shipt.com',
          name: 'Grocery Shopper',
          company: 'Shipt',
          city: 'Los Angeles',
          state: 'CA',
          category: HustleCategory.RESTAURANT,
          affiliateLink:
            'https://click.appcast.io/track/12o1f10?cs=i3h&exch=25&jg=1drx&bid=ubUnnIfdRsq5krX1vsvoZQ==&sar_id=n7vlfj&jpos=0',
          postedDate: '2020-08-12',
          description:
            "<p>Help people get what they need while earning extra income. Shipt is a marketplace that provides fresh produce, household essentials, and more from trusted local stores. There's never been a better time to join Shipt and earn on a flexible schedule.</p>\n<p>Your role:</p>\n<ul>\n<li>Accept local orders in the Shipt Shopper app</li>\n<li>Shop and deliver orders (door drop-off options available)</li>\n<li>Deliver a high-quality customer experience</li>\n</ul>\n<p>Why choose Shipt?</p>\n<ul>\n<li>Extra income: Get paid weekly, keep 100% of tips, and earn up to $22/hr or more.</li>\n<li>Help your community: Provide a valuable service and form connections.</li>\n<li>Flexible hours: Choose your schedule and work when it’s best for you.</li>\n<li>Safety first: Door drop-off options are available – no home entry required.</li>\n<li>24/7 support: Our support team is always ready to help.</li>\n<li>Free membership: Discover the convenience of same-day delivery for yourself.</li>\n<li>Join the family: Meet sho</li></ul>",
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it('should return 502 response when call to Appcast fails', async () => {
      const externalId = '6721_2262-4016cfcbc087b68698af5cd55826d666';
      const hustleId = `${HustlePartner.Appcast}|${externalId}`;
      sandbox.stub(AppcastClient.agent, 'post').returns({
        send: sandbox.stub().rejects(),
      });
      const response = await request(app)
        .get(`/v2/hustles/${hustleId}`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(502);
      expect(response.body.message).to.match(
        /Dave's system had a hiccup. Mind waiting a few minutes and trying again?/,
      );
      sandbox.restore();
    });

    it('should a return 400 response with InvalidParamtersError message given invalid hustleId', async () => {
      const response = await request(app)
        .get(`/v2/hustles/345ur4frjsdhj`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/InvalidHustleId/);
    });

    it('should return a 404 response with NotFoundError message if no Dave Hustle matches id', async () => {
      const response = await request(app)
        .get(`/v2/hustles/${HustlePartner.Dave}|invalid-dave-id`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(404);
      expect(response.body.message).to.match(/HustleExternalIdNotFound/);
    });

    it(
      'should return a 404 response with NotFoundError message if no Appcast Hustle matches id',
      replayHttp('appcast/search-by-id/job-not-found.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles/${HustlePartner.Appcast}|invalid-appcast-id`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        expect(response.status).to.equal(404);
        expect(response.body.message).to.match(/HustleExternalIdNotFound/);
      }),
    );

    it('should return a 401 repsonse with UnauthorizedError message if invalid user credentials', async () => {
      const response = await request(app)
        .get(`/v2/hustles/${HustlePartner.Appcast}|some-id`)
        .set('Authorization', `12345`)
        .set('X-Device-Id', `12345`);
      expect(response.status).to.equal(401);
    });

    it('should return a 403 response with paused error message if the user is paused', async () => {
      const pausedUser = await factory.create('user');
      await factory.create('membership-pause', { userId: pausedUser.id });
      const response = await request(app)
        .get(`/v2/hustles/${HustlePartner.Appcast}|some-id`)
        .set('Authorization', `${pausedUser.id}`)
        .set('X-Device-Id', `${pausedUser.id}`);
      expect(response.status).to.equal(403);
      expect(response.body.message).to.match(
        /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature/,
      );
    });
  });

  describe('GET /v2/hustles?searchCriteria=foo', () => {
    before(async () => {
      await clean(sandbox);
      const [userFromPromise, daveJob] = await Promise.all([
        factory.create('user'),
        factory.create('dave-hustle'),
      ]);
      const otherDaveJob = await factory.create('dave-hustle', {
        name: 'Customer Associate',
        description: 'Sales job with good benefits and flexible hours.',
        externalId: 'supersales',
        sideHustleCategoryId: factory.assoc('retail-hustle-category', 'id'),
      });

      user = userFromPromise;
      daveHustle = daveJob;
      otherDaveHustle = otherDaveJob;
    });

    after(() => clean(sandbox));

    it('should return a Dave HustleSearchResponse with status 200 OK ', async () => {
      const hustleId = `${HustlePartner.Dave}|${daveHustle.externalId}`;
      const otherHustleId = `${HustlePartner.Dave}|${otherDaveHustle.externalId}`;
      const expectedHustleResponse: HustleSearchResponse = {
        page: 0,
        totalPages: 1,
        hustles: [
          {
            hustleId,
            name: daveHustle.name,
            company: daveHustle.company,
            city: null,
          },
          {
            hustleId: otherHustleId,
            name: otherDaveHustle.name,
            company: otherDaveHustle.company,
            city: null,
          },
        ],
      };
      const response = await request(app)
        .get(`/v2/hustles?partner=DAVE`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(200);
      expect(response.body.page).to.equal(0);
      expect(response.body.totalPages).to.equal(1);
      expect(response.body.hustles.length).to.equal(2);
      expect(response.body.hustles).to.eql(expectedHustleResponse.hustles);
    });

    it('should return a Dave HustleSearchResponse with status 200 OK matching certain keywords', async () => {
      const otherHustleId = `${HustlePartner.Dave}|${otherDaveHustle.externalId}`;
      const expectedHustleResponse: HustleSearchResponse = {
        page: 0,
        totalPages: 1,
        hustles: [
          {
            hustleId: otherHustleId,
            name: otherDaveHustle.name,
            company: otherDaveHustle.company,
            city: null,
          },
        ],
      };
      const response = await request(app)
        .get(`/v2/hustles?partner=DAVE&keyword=Sales`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(200);
      expect(response.body).to.eql(expectedHustleResponse);
    });

    it('should return a Dave HustleSearchResponse with status 200 OK matching certain category', async () => {
      const hustleId = `${HustlePartner.Dave}|${daveHustle.externalId}`;
      const expectedHustleResponse: HustleSearchResponse = {
        page: 0,
        totalPages: 1,
        hustles: [
          {
            hustleId,
            name: daveHustle.name,
            company: daveHustle.company,
            city: null,
          },
        ],
      };
      const response = await request(app)
        .get(`/v2/hustles?partner=DAVE&category=Transportation`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);

      expect(response.status).to.equal(200);
      expect(response.body).to.eql(expectedHustleResponse);
    });

    it(
      'should return first page of Appcast Hustles for keyword Sales with a 200 OK status',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles?keyword=Sales&partner=APPCAST`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleSearchResponse = {
          page: 0,
          totalPages: 55374,
          hustles: [
            {
              hustleId: `${HustlePartner.Appcast}|9284_oSrrdfwH`,
              name: 'Sales',
              company: 'Northern Tool & Equipment - Glassdoor 3.8 ✪',
              city: 'Garland',
            },
            {
              hustleId: `${HustlePartner.Appcast}|6879_R00031686`,
              name: 'sales',
              company: 'Michaels',
              city: 'West Fargo',
            },
          ],
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it(
      'should return Dave Hustles before Apppcast on the first page for keyword Sales with a 200 OK status',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles?keyword=Sales`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleSearchResponse = {
          page: 0,
          totalPages: 55374,
          hustles: [
            {
              hustleId: `${HustlePartner.Dave}|${otherDaveHustle.externalId}`,
              name: otherDaveHustle.name,
              company: otherDaveHustle.company,
              city: null,
            },
            {
              hustleId: `${HustlePartner.Appcast}|9284_oSrrdfwH`,
              name: 'Sales',
              company: 'Northern Tool & Equipment - Glassdoor 3.8 ✪',
              city: 'Garland',
            },
            {
              hustleId: `${HustlePartner.Appcast}|6879_R00031686`,
              name: 'sales',
              company: 'Michaels',
              city: 'West Fargo',
            },
          ],
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it(
      'should return only Appcast Hustles on the second page for keyword Sales with a 200 OK status',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles?keyword=Sales&page=1`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleSearchResponse = {
          page: 1,
          totalPages: 55374,
          hustles: [
            {
              hustleId: `${HustlePartner.Appcast}|10849_955877`,
              name: 'Enterprise Sales',
              company: 'Appcast',
              city: 'Needham',
            },
            {
              hustleId: `${HustlePartner.Appcast}|10849_955878`,
              name: 'Enterprise Sales',
              company: 'Appcast',
              city: 'Lebanon',
            },
          ],
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it(
      'Should return Appcast hustles with lat/long and radius specified with 200 OK status',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles?lat=34.283370&long=-118.432060&radius=10&page=1`) // setting page to 1 to avoid dave jobs.
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleSearchResponse = {
          page: 1,
          totalPages: 723,
          hustles: [
            {
              hustleId: `${HustlePartner.Appcast}|10517_J3S7KJ60B6YT4PFQ7ZH-6d2b7a85559d09e4b180d1f6ce4c1b9b`,
              name: 'Delivery Driver - Full-time',
              company: 'Amazon Contracted Delivery Partners',
              city: 'San Fernando',
            },
            {
              hustleId: `${HustlePartner.Appcast}|10517_J3S7KJ60B6YT4PFQ7ZH-bf3b9107819dd2da12594a5a25a8e569`,
              name: 'Delivery Driver - Earn $15.00 - $16.25++/hr',
              company: 'Amazon Contracted Delivery Partners',
              city: 'San Fernando',
            },
          ],
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it(
      'Should return Appcast hustles in posted_date order 200 OK status',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const response = await request(app)
          .get(`/v2/hustles?lat=34.283370&long=-118.432060&posted_date_sort=desc&page=1`) // setting page to 1 to avoid dave jobs.
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`);
        const expectedHustleResponse: HustleSearchResponse = {
          page: 1,
          totalPages: 9398,
          hustles: [
            {
              hustleId: `${HustlePartner.Appcast}|10452_R0133588`,
              name: 'Registered Nurse - Peritoneal Dialysis',
              company: 'DaVita',
              city: 'Los Angeles',
            },
            {
              hustleId: `${HustlePartner.Appcast}|10452_R0134922`,
              name: 'Registered Nurse II',
              company: 'DaVita',
              city: 'Carson',
            },
          ],
        };
        expect(response.status).to.equal(200);
        expect(response.body).to.eql(expectedHustleResponse);
      }),
    );

    it('should return Dave jobs with 200 response with message when call to Appcast fails', async () => {
      const otherHustleId = `${HustlePartner.Dave}|${otherDaveHustle.externalId}`;
      const expectedHustleResponse: HustleSearchResponse = {
        page: 0,
        totalPages: 1,
        message:
          "Whoops, Dave wasn't able to load all the current job openings. Please try again in a few minutes.",
        hustles: [
          {
            hustleId: otherHustleId,
            name: otherDaveHustle.name,
            company: otherDaveHustle.company,
            city: null,
          },
        ],
      };
      sandbox.stub(AppcastClient.agent, 'post').returns({
        send: sandbox.stub().rejects(),
      });
      const response = await request(app)
        .get(`/v2/hustles?keyword=Sales`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(200);
      expect(response.body).to.eql(expectedHustleResponse);
      sandbox.restore();
    });
    it('should return a 400 response with InvalidParameterError when query requests non-numeric page number', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=tech&page=any`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query requests negative page number', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=tech&page=-1`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains invalid posted_date sort', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=tech&posted_date_sort=bubble-sort`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains invalid HustlePartner', async () => {
      const response = await request(app)
        .get(`/v2/hustles?partner=Chime`) // INVALID!
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains non numeric radis', async () => {
      const response = await request(app)
        .get(`/v2/hustles?lat=34.283370&long=-118.432060&radius=zero`) // San Fernando Brewing Company!
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains invalid distance_sort value', async () => {
      const response = await request(app)
        .get(`/v2/hustles?lat=34.283370&long=-118.432060&distance_sort=blargh`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains only long but no lat', async () => {
      const response = await request(app)
        .get(`/v2/hustles?long=-118.432060`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains only lat but no long', async () => {
      const response = await request(app)
        .get(`/v2/hustles?lat=34.283370`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query specifies radius without a lat/long', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=anything&radius=25`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query specifies distance sort but no lat/long', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=anything&distance_sort=desc`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when query contains invalid category', async () => {
      const response = await request(app)
        .get(`/v2/hustles?category=timetravel`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/Invalid Hustle Search Options/);
    });

    it('should return a 400 response with InvalidParameterError when no search query is provided', async () => {
      const response = await request(app)
        .get(`/v2/hustles`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`);
      expect(response.status).to.equal(400);
      expect(response.body.message).to.match(/At least one Hustle Search Option is required/);
    });

    it('should return a 401 repsonse with UnauthorizedError if invalid user credentials', async () => {
      const response = await request(app)
        .get(`/v2/hustles?keyword=office`)
        .set('Authorization', `12345`)
        .set('X-Device-Id', `12345`);
      expect(response.status).to.equal(401);
    });

    it('should return a 403 response with paused error message if the user is paused', async () => {
      const pausedUser = await factory.create('user');
      await factory.create('membership-pause', { userId: pausedUser.id });
      const response = await request(app)
        .get(`/v2/hustles?keyword=medical`)
        .set('Authorization', `${pausedUser.id}`)
        .set('X-Device-Id', `${pausedUser.id}`);
      expect(response.status).to.equal(403);
      expect(response.body.message).to.match(
        /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature/,
      );
    });
  });

  describe('GET /v2/hustles/saved_hustles', () => {
    before(() => clean(sandbox));
    afterEach(() => clean(sandbox));

    it('should return all saved jobs for user in desc order by date updated', async () => {
      const testUser = await factory.create<User>('user');
      const latestSavedJob = await factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
        userId: testUser.id,
      });
      // create saved job in the past
      fakeDateTime(sandbox, moment().subtract(1, 'week'));
      const olderSavedJob = await factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
        userId: testUser.id,
      });

      const response = await request(app)
        .get(`/v2/hustles/saved_hustles`)
        .set('Authorization', `${testUser.id}`)
        .set('X-Device-Id', `${testUser.id}`);
      const [olderJobHustleId, latestJobHustleId] = await Promise.all([
        getHustleIdForSavedJob(olderSavedJob),
        getHustleIdForSavedJob(latestSavedJob),
      ]);
      expect(response.body[0].hustleId).to.equal(latestJobHustleId);
      expect(response.body[1].hustleId).to.equal(olderJobHustleId);
      expect(response.body[0].name).to.exist;
      expect(response.body[0].company).to.exist;
      expect(response.body[0].city).not.to.be.undefined;
    });

    it('should return empty array when user has no saved jobs', async () => {
      const testUser = await factory.create<User>('user');
      const response = await request(app)
        .get(`/v2/hustles/saved_hustles`)
        .set('Authorization', `${testUser.id}`)
        .set('X-Device-Id', `${testUser.id}`);
      expect(response.body).to.be.empty;
    });

    it('should throw InvalidSessionError if invalud auth credentials are provided', async () => {
      const testUser = await factory.create<User>('user');
      const response = await request(app)
        .get(`/v2/hustles/saved_hustles`)
        .set('Authorization', `${testUser.id}+9`)
        .set('X-Device-Id', `${testUser.id}+8`);
      expect(response.status).to.equal(401);
    });
  });

  describe('POST /v2/hustles/saved_hustles', () => {
    beforeEach(async () => {
      const [userFromPromise, daveHustleFromPromise, appcastHustleFromPromise] = await Promise.all([
        factory.create('user'),
        factory.create('dave-hustle'),
        factory.create('appcast-hustle'),
      ]);
      user = userFromPromise;
      daveHustle = daveHustleFromPromise;
      appcastHustle = appcastHustleFromPromise;
    });

    afterEach(() => clean(sandbox));

    it('should save a Dave job and return updated saved jobs', async () => {
      const jobId = constructJobIdStrings(daveHustle.partner, daveHustle.externalId);
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ jobId });
      expect(result.status).to.equal(200);
      expect(result.body).to.eql([
        {
          hustleId: createHustleIdFromSideHustle(daveHustle),
          city: daveHustle.city,
          name: daveHustle.name,
          company: daveHustle.company,
        },
      ]);
      const savedRow = await SideHustleSavedJob.findOne({
        where: { userId: user.id, sideHustleId: daveHustle.id },
      });
      expect(savedRow).to.not.be.null;
    });

    it('should 404 if the Dave job does not exist', async () => {
      const jobId = constructJobIdStrings(HustlePartner.Dave, 'xxxdontexist');
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ jobId });
      expect(result.status).to.equal(404);
    });

    it('should throw a forbidden error if user has membership paused', async () => {
      const pausedUser = await factory.create('user', {}, { hasSession: true });
      await factory.create('membership-pause', { userId: pausedUser.id });
      const jobId = constructJobIdStrings(HustlePartner.Appcast, 'some externalId');
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', pausedUser.id)
        .set('X-Device-Id', pausedUser.id)
        .send({ jobId });
      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(
        /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature\./,
      );
    });

    it('should save an Appcast job that has been previously saved and return updated saved jobs', async () => {
      const jobId = constructJobIdStrings(appcastHustle.partner, appcastHustle.externalId);
      const appcastSearchStub = sandbox.stub(AppcastClient, 'searchByAppcastJobId');
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ jobId });
      expect(result.status).to.equal(200);
      expect(result.body).to.eql([
        {
          hustleId: createHustleIdFromSideHustle(appcastHustle),
          city: appcastHustle.city,
          name: appcastHustle.name,
          company: appcastHustle.company,
        },
      ]);
      const savedRow = await SideHustleSavedJob.findOne({
        where: { userId: user.id, sideHustleId: appcastHustle.id },
      });
      expect(savedRow).to.not.be.null;
      expect(appcastSearchStub).to.not.be.called;
      sandbox.restore();
    });

    it('should update `updated` timestamp if user has already saved job and return updated saved jobs', async () => {
      fakeDateTime(sandbox, moment().subtract(1, 'month'));
      const [previouslySavedJob] = await Promise.all([
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          sideHustleId: appcastHustle.id,
          userId: user.id,
        }),
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          sideHustleId: daveHustle.id,
          userId: user.id,
        }),
      ]);
      const previousUpdateTimpestamp = previouslySavedJob.updated;
      sandbox.restore();

      const jobId = constructJobIdStrings(appcastHustle.partner, appcastHustle.externalId);
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ jobId });
      expect(result.status).to.equal(200);
      expect(result.body).to.deep.include.members([
        {
          hustleId: createHustleIdFromSideHustle(appcastHustle),
          city: appcastHustle.city,
          company: appcastHustle.company,
          name: appcastHustle.name,
        },
        {
          hustleId: createHustleIdFromSideHustle(daveHustle),
          city: daveHustle.city,
          company: daveHustle.company,
          name: daveHustle.name,
        },
      ]);
      await previouslySavedJob.reload();
      const currentUpdatedTimestamp = previouslySavedJob.updated;
      expect(currentUpdatedTimestamp.isAfter(previousUpdateTimpestamp)).to.be.true;
    });

    it(
      'should save an Appcast job that has never been saved before',
      replayHttp('appcast/search-by-id/success.json', async () => {
        const externalId = '6721_2262-4016cfcbc087b68698af5cd55826d666';
        const hustleId = constructJobIdStrings(HustlePartner.Appcast, externalId);
        const result = await request(app)
          .post('/v2/hustles/saved_hustles')
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send({ jobId: hustleId });
        expect(result.status).to.equal(200);
        expect(result.body).to.eql([
          {
            hustleId,
            city: 'Los Angeles',
            name: 'Grocery Shopper',
            company: 'Shipt',
          },
        ]);
        const sideHustleRow = await SideHustle.findOne({
          where: { partner: HustlePartner.Appcast, externalId },
        });
        expect(sideHustleRow).to.not.be.null;
        const savedRow = await SideHustleSavedJob.findOne({
          where: { userId: user.id, sideHustleId: sideHustleRow.id },
        });
        expect(savedRow).to.not.be.null;
      }),
    );

    it(
      'should 404 when the Appcast job doesnt exist',
      replayHttp('appcast/search-by-id/job-not-found.json', async () => {
        const externalId = 'invalid-appcast-id';
        const jobId = constructJobIdStrings(HustlePartner.Appcast, externalId);
        const result = await request(app)
          .post('/v2/hustles/saved_hustles')
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send({ jobId });
        expect(result.status).to.equal(404);
        const sideHustleRow = await SideHustle.findOne({
          where: { partner: HustlePartner.Appcast, externalId },
        });
        expect(sideHustleRow).to.be.null;
      }),
    );

    it('should throw an InvalidParametersError if no hustleId is provided', async () => {
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({});
      expect(result.status).to.equal(400);
    });

    it('should throw an InvalidParametersError if hustleId is invalid', async () => {
      const jobId = 'NotAPartner|137838-ADF';
      const result = await request(app)
        .post('/v2/hustles/saved_hustles')
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send({ jobId });
      expect(result.status).to.equal(400);
    });
  });

  describe('DELETE /v2/hustles/saved_hustles/:hustleId', () => {
    beforeEach(async () => {
      user = await factory.create('user');
    });
    afterEach(() => clean(sandbox));

    it('should throw an invalid parameters error if invalid hustleId is provided', async () => {
      const result = await request(app)
        .delete(`/v2/hustles/saved_hustles/invalidHustleId`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send();
      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/InvalidHustleId/);
    });

    it('should throw a forbidden error if user has membership paused', async () => {
      const pausedUser = await factory.create('user');
      await factory.create('membership-pause', { userId: pausedUser.id });
      const result = await request(app)
        .delete(`/v2/hustles/saved_hustles/validHustleId`)
        .set('Authorization', pausedUser.id)
        .set('X-Device-Id', pausedUser.id)
        .send();
      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(
        /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature\./,
      );
    });

    it("does not throw an error if a user unsaves a job they haven't saved", async () => {
      const hustle = await factory.create<SideHustle>('side-hustle');
      const hustleId = createHustleIdFromSideHustle(hustle);
      const result = await request(app)
        .delete(`/v2/hustles/saved_hustles/${hustleId}`)
        .set('Authorization', `${user.id}`)
        .set('X-Device-Id', `${user.id}`)
        .send();
      expect(result.status).to.equal(200);
      expect(result.body).to.be.empty;
    });

    describe('tests that require extra setup', () => {
      beforeEach(async () => {
        const [daveHustleFromPromise, appcastHustleFromPromise] = await Promise.all([
          factory.create('dave-hustle'),
          factory.create('appcast-hustle'),
        ]);
        daveHustle = daveHustleFromPromise;
        appcastHustle = appcastHustleFromPromise;
        await Promise.all([
          factory.create('side-hustle-saved-job', { userId: user.id, sideHustleId: daveHustle.id }),
          factory.create('side-hustle-saved-job', {
            userId: user.id,
            sideHustleId: appcastHustle.id,
          }),
        ]);
      });
      afterEach(() => clean(sandbox));

      it('should unsave a dave job', async () => {
        const hustleId = createHustleIdFromSideHustle(daveHustle);
        const unsaveRes = await request(app)
          .delete(`/v2/hustles/saved_hustles/${hustleId}`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send();
        expect(unsaveRes.status).to.equal(200);
        expect(unsaveRes.body).to.eql([
          {
            hustleId: createHustleIdFromSideHustle(appcastHustle),
            city: appcastHustle.city,
            name: appcastHustle.name,
            company: appcastHustle.company,
          },
        ]);
        const unsavedRow = await SideHustleSavedJob.findOne({
          where: { userId: user.id, sideHustleId: daveHustle.id },
        });
        expect(unsavedRow).to.be.null;
      });

      it('should unsave an appcast job', async () => {
        const hustleId = createHustleIdFromSideHustle(appcastHustle);
        const unsaveRes = await request(app)
          .delete(`/v2/hustles/saved_hustles/${hustleId}`)
          .set('Authorization', `${user.id}`)
          .set('X-Device-Id', `${user.id}`)
          .send();
        expect(unsaveRes.status).to.equal(200);
        expect(unsaveRes.body).to.eql([
          {
            hustleId: createHustleIdFromSideHustle(daveHustle),
            city: daveHustle.city,
            name: daveHustle.name,
            company: daveHustle.company,
          },
        ]);
        const unsavedRow = await SideHustleSavedJob.findOne({
          where: { userId: user.id, sideHustleId: appcastHustle.id },
        });
        expect(unsavedRow).to.be.null;
      });
    });
  });

  describe('GET /v2/hustles/categories', () => {
    afterEach(() => clean(sandbox));

    const expectedResponse: HustleCategoryResponse[] = [
      { name: HustleCategory.AVIATION, image: 'url', priority: 2 },
      { name: HustleCategory.NON_PROFIT, image: 'url', priority: 7 },
      { name: HustleCategory.SUPPLY_CHAIN, image: 'url', priority: 8 },
    ];

    it('should return HustleCategoryResponse[]', async () => {
      const testUser = await factory.create<User>('user');
      sandbox.stub(HustleService, 'getCategories').resolves(expectedResponse);

      const response = await request(app)
        .get('/v2/hustles/categories')
        .set('Authorization', `${testUser.id}`)
        .set('X-Device-Id', `${testUser.id}`)
        .send();
      expect(response.body).to.deep.equal(expectedResponse);
    });

    it('should return UnauthorizedError if user credentials are invalid', async () => {
      await request(app)
        .get('/v2/hustles/categories')
        .set('Authorization', `123`)
        .set('X-Device-Id', `123`)
        .send()
        .expect(401);
    });
  });

  describe('GET /v2/hustles/job_packs', () => {
    afterEach(() => clean(sandbox));

    it('should return all job packs', async () => {
      const nonAdminUser = await factory.create<User>('user');
      await Promise.all([factory.create('hustle-job-pack'), factory.create('hustle-job-pack')]);

      const response = await request(app)
        .get('/v2/hustles/job_packs')
        .set('Authorization', `${nonAdminUser.id}`)
        .set('X-Device-Id', `${nonAdminUser.id}`)
        .send();

      expect(response.status).to.be.eq(200);
      expect(response.body.length).to.be.eq(2);
      response.body.forEach((hustleJobPack: HustleJobPackResponse) => {
        expect(hustleJobPack.name).to.exist;
        expect(hustleJobPack.sortBy).to.exist;
        expect(hustleJobPack.sortOrder).to.exist;
        expect(hustleJobPack.bgColor).to.exist;
        expect(hustleJobPack.image).to.exist;
      });
    });

    it('should return a InvalidSessionError if user is not authenticated', async () => {
      const nonExistentUserId = '9999999';
      const response = await request(app)
        .get('/v2/hustles/job_packs')
        .set('Authorization', nonExistentUserId)
        .set('X-Device-Id', nonExistentUserId)
        .send();

      expect(response.status).to.be.eq(401);
      expect(response.body.message).to.be.match(/No valid session was found for device_id/);
    });
  });
});
