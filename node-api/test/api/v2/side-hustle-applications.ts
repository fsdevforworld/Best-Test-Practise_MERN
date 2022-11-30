import { HustleCategory, HustlePartner } from '@dave-inc/wire-typings';
import * as request from 'supertest';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import braze from '../../../src/lib/braze';
import amplitude from '../../../src/lib/amplitude';
import firebase from '../../../src/lib/firebase-remote-config';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';
import { Status } from '../../../src/models/side-hustle-application';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import * as Jobs from '../../../src/jobs/data';
import { SideHustleProvider, SideHustleCategory } from '../../../src/models';

import app from '../../../src/api';

describe('/v2/side_hustle_applications', () => {
  describe('GET /v2/side_hustle_applications', () => {
    let instacart: any;
    let uber: any;
    let uberEats: any;

    before(async () => {
      await clean();
      const categoryName = HustleCategory.ACCOUNTING;
      const [daveProvider, appCastProvider, sideHustleCategory] = await Promise.all([
        factory.create<SideHustleProvider>('side-hustle-provider', {
          name: HustlePartner.Dave,
          isDaveAuthority: true,
        }),
        factory.create<SideHustleProvider>('side-hustle-provider', {
          name: HustlePartner.Appcast,
          isDaveAuthority: false,
        }),
        factory.create<SideHustleCategory>('side-hustle-category', {
          name: categoryName,
          priority: 10,
        }),
      ]);

      const jobs = [
        {
          id: 1,
          name: 'Airbnb',
          externalId: 'airbnb',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 100,
          costPerApplication: 800,
        },
        {
          id: 2,
          name: 'Instacart Shopper',
          externalId: 'instacart',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 200,
          costPerApplication: 100,
        },
        {
          id: 3,
          name: 'Uber Eats Delivery Partner',
          active: 0,
          externalId: 'ubereats',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 120,
          costPerApplication: 730,
        },
        {
          id: 4,
          name: 'Uber Driver Partner',
          externalId: 'uber',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 1540,
          costPerApplication: 157,
        },
        {
          id: 5,
          name: 'Not Dave',
          externalId: 'Not Dave',
          sideHustleProviderId: appCastProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 102,
          costPerApplication: 346,
        },
      ];
      instacart = jobs[1];
      uberEats = jobs[2];
      uber = jobs[3];

      const createdJobs = jobs.map(job => {
        return factory.create('side-hustle-job', job);
      });

      await Bluebird.all(createdJobs);
    });

    after(() => clean());

    it('should successfully retrieve all applications for a user', async () => {
      const user = await factory.create('user', {}, { hasSession: true });

      await factory.create('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: instacart.id,
      });

      await factory.create('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: uber.id,
      });

      const result = await request(app)
        .get('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body[0].sideHustleJobId).to.equal(instacart.id);
      expect(result.body[0].name).to.equal('Instacart Shopper');
      expect(result.body[1].sideHustleJobId).to.equal(uber.id);
      expect(result.body[1].name).to.equal('Uber Driver Partner');
    });

    it('should successfully retrieve inactive jobs as well', async () => {
      const user = await factory.create('user', {}, { hasSession: true });

      await factory.create('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: instacart.id,
      });

      await factory.create('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: uberEats.id,
      });

      const result = await request(app)
        .get('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);

      expect(result.status).to.equal(200);
      expect(result.body[0].sideHustleJobId).to.equal(instacart.id);
      expect(result.body[0].name).to.equal('Instacart Shopper');
      expect(result.body[1].sideHustleJobId).to.equal(uberEats.id);
      expect(result.body[1].name).to.equal('Uber Eats Delivery Partner');
    });
  });

  describe('POST /v2/side_hustle_applications', () => {
    const sandbox = sinon.createSandbox();
    let user: any;
    let brazeStub: any;
    let amplitudeStub: any;
    let instacart: any;
    let uber: any;
    before(() => clean());

    beforeEach(async () => {
      user = await factory.create('user', {}, { hasSession: true });

      sandbox
        .stub(firebase, 'getTemplate')
        .resolves([
          '{"parameters": {"side_hustle_applications_received_dev": {"defaultValue": {"value": "5"}}}}',
          'etag-test',
        ]);
      sandbox.stub(Jobs, 'sideHustleNotificationsTask');
      sandbox.stub(firebase, 'publishTemplate').resolves();
      amplitudeStub = sandbox.stub(amplitude, 'track').resolves();
      brazeStub = sandbox.stub(braze, 'track').resolves();
      const categoryName = HustleCategory.PHARMACEUTICAL;
      const [daveProvider, appCastProvider, sideHustleCategory] = await Promise.all([
        factory.create<SideHustleProvider>('side-hustle-provider', {
          name: HustlePartner.Dave,
          isDaveAuthority: true,
        }),
        factory.create<SideHustleProvider>('side-hustle-provider', {
          name: HustlePartner.Appcast,
          isDaveAuthority: false,
        }),
        factory.create<SideHustleCategory>('side-hustle-category', {
          name: categoryName,
          priority: 10,
        }),
      ]);

      const jobs = [
        {
          id: 1,
          name: 'Airbnb',
          externalId: 'airbnb',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 100,
          costPerApplication: 800,
        },
        {
          id: 2,
          name: 'Instacart Shopper',
          externalId: 'instacart',
          company: 'Instacart',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 200,
          costPerApplication: 100,
        },
        {
          id: 3,
          name: 'Uber Eats Delivery Partner',
          active: 0,
          externalId: 'ubereats',
          company: 'Uber Eats',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 120,
          costPerApplication: 730,
        },
        {
          id: 4,
          name: 'Uber Driver Partner',
          externalId: 'uber',
          company: 'Uber',
          sideHustleProviderId: daveProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 1540,
          costPerApplication: 157,
        },
        {
          id: 5,
          name: 'Not Dave',
          externalId: 'Not Dave',
          sideHustleProviderId: appCastProvider.id,
          sideHustleCategoryId: sideHustleCategory.id,
          costPerClick: 102,
          costPerApplication: 346,
        },
      ];

      instacart = jobs[1];
      uber = jobs[3];

      const createdJobs = jobs.map(job => {
        return factory.create('side-hustle-job', job);
      });
      await Bluebird.all(createdJobs);
    });

    afterEach(() => clean(sandbox));

    it('should successfully create side hustle applications', async () => {
      const result = await request(app)
        .post('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({
          jobs: [instacart.id, uber.id],
        });

      expect(result.status).to.equal(200);
      result.body = result.body.sort((a: any, b: any) => a.sideHustleJobId - b.sideHustleJobId);
      expect(result.body[0].sideHustleJobId).to.equal(instacart.id);
      expect(result.body[0].name).to.equal('Instacart Shopper');
      expect(result.body[0].status).to.equal(Status.REQUESTED);
      expect(result.body[1].sideHustleJobId).to.equal(uber.id);
      expect(result.body[1].name).to.equal('Uber Driver Partner');
      expect(result.body[1].status).to.equal(Status.REQUESTED);
    });

    it('should successfully create new applications and update existing ones', async () => {
      await factory.create('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: instacart.id,
        status: Status.OPENED,
      });

      const result = await request(app)
        .post('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({
          jobs: [instacart.id, uber.id],
        });

      expect(result.status).to.equal(200);
      result.body = result.body.sort((a: any, b: any) => a.sideHustleJobId - b.sideHustleJobId);
      expect(result.body.length).to.equal(2);
      expect(result.body[0].sideHustleJobId).to.equal(instacart.id);
      expect(result.body[0].name).to.equal('Instacart Shopper');
      expect(result.body[0].status).to.equal(Status.REQUESTED);
      expect(result.body[1].sideHustleJobId).to.equal(uber.id);
      expect(result.body[1].name).to.equal('Uber Driver Partner');
      expect(result.body[1].status).to.equal(Status.REQUESTED);
    });

    it('should successfully fire amplitude and braze events for successful email and sms', async () => {
      sandbox.stub(sendgrid, 'sendDynamic').resolves([
        {
          statusCode: 202,
        },
      ]);
      sandbox.stub(twilio, 'send').resolves();
      const testJobs = [
        {
          id: instacart.id,
          company: instacart.company,
        },
        {
          id: uber.id,
          company: uber.company,
        },
      ];

      const result = await request(app)
        .post('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({
          jobs: [instacart.id, uber.id],
        });
      expect(result.status).to.equal(200);
      expect(amplitudeStub).to.have.been.calledWith({
        userId: user.id,
        eventType: 'applications requested',
        eventProperties: {
          jobs: testJobs.map((job: { id: number; company: string }): string => job.company),
        },
      });
      expect(brazeStub).to.have.been.calledWith({
        events: [
          {
            name: 'applications requested',
            externalId: String(user.id),
            properties: {
              [instacart.company]: true,
              [uber.company]: true,
            },
            time: sinon.match.any,
          },
        ],
      });
    });

    it('should throw a forbidden error if user has membership paused', async () => {
      user = await factory.create('user', {}, { hasSession: true });
      await factory.create('membership-pause', { userId: user.id });

      const result = await request(app)
        .post('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send({
          jobs: [instacart.id, uber.id],
        });

      expect(result.status).to.equal(403);
      expect(result.body.message).to.match(
        /Your Dave membership is currently paused\. Please update your app and unpause your membership to access this feature\./,
      );
    });

    it('should fail if job ids are not provided', async () => {
      const result = await request(app)
        .post('/v2/side_hustle_applications')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id);
      expect(result.status).to.equal(400);
    });
  });
});
