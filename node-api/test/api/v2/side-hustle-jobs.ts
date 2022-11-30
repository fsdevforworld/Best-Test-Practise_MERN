import { HustleCategory, HustlePartner } from '@dave-inc/wire-typings';
import * as request from 'supertest';
import factory from '../../factories';
import app from '../../../src/api';
import { clean } from '../../test-helpers';
import { expect } from 'chai';
import * as Bluebird from 'bluebird';
import { SideHustleProvider, SideHustleCategory } from '../../../src/models';

describe('/v2/side_hustle_jobs', () => {
  before(async () => {
    await clean();
    const [daveProvider, sideHustleCategory] = await Promise.all([
      factory.create<SideHustleProvider>('side-hustle-provider', {
        name: HustlePartner.Dave,
        isDaveAuthority: true,
      }),
      factory.create<SideHustleCategory>('side-hustle-category', {
        name: HustleCategory.CHILDCARE,
        priority: 10,
      }),
    ]);
    const jobs = [
      // note our sorting tests will fail if the names or cpc or cpa are the same, if you want to make them the same, you need to go fix the test below too
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
        name: 'Instacart',
        externalId: 'instacart',
        sideHustleProviderId: daveProvider.id,
        sideHustleCategoryId: sideHustleCategory.id,
        costPerClick: 200,
        costPerApplication: 100,
      },
      {
        id: 3,
        name: 'UberEats',
        active: 0,
        externalId: 'ubereats',
        sideHustleProviderId: daveProvider.id,
        sideHustleCategoryId: sideHustleCategory.id,
        costPerClick: 120,
        costPerApplication: 730,
      },
      {
        id: 4,
        name: 'Uber',
        externalId: 'uber',
        sideHustleProviderId: daveProvider.id,
        sideHustleCategoryId: sideHustleCategory.id,
        costPerClick: 1540,
        costPerApplication: 157,
      },
    ];
    await Bluebird.each(jobs, (job: any) => factory.create('side-hustle-job', job));
  });

  after(() => clean());

  it('should return all jobs that are active', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .get('/v2/side_hustle_jobs')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(200);
    // Response should only include the three active jobs
    expect(result.body.length).to.equal(3);
  });

  it('category and provider should be null in GET /v2/side_hustle_jobs response', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .get('/v2/side_hustle_jobs')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(200);
    // Response should only include the three active jobs from the Dave provider created from the factory
    expect(result.body.length).to.equal(3);
    for (const job of result.body) {
      expect(job.provider).to.be.null;
      expect(job.category).to.be.null;
    }
  });

  it('should throw a forbidden error if user has membership paused', async () => {
    const user = await factory.create('user', {}, { hasSession: true });
    await factory.create('membership-pause', { userId: user.id });

    const result = await request(app)
      .get('/v2/side_hustle_jobs')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(403);
    expect(result.body.message).to.match(
      /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature\./,
    );
  });

  it('should sort correctly by alpha', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .get('/v2/side_hustle_jobs?sortBy=alpha')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(200);
    expect(result.body.length).to.equal(3);
    let prev = 'a';
    for (const job of result.body) {
      const compareRes = prev.localeCompare(job.name);
      expect(compareRes).to.equal(-1);
      prev = job.name;
    }
  });

  it('should sort correctly by cpc', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .get('/v2/side_hustle_jobs?sortBy=costPerClick')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(200);
    expect(result.body.length).to.equal(3);
    // cpc sorts desc
    let cpcPrev = 999999999;
    for (const job of result.body) {
      const compareRes = cpcPrev > job.costPerClick;
      expect(compareRes).to.equal(true);
      cpcPrev = job.costPerClick;
    }
  });

  it('should sort correctly by cpa', async () => {
    const user = await factory.create('user', {}, { hasSession: true });
    const result = await request(app)
      .get('/v2/side_hustle_jobs?sortBy=costPerApplication')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);
    expect(result.status).to.equal(200);
    expect(result.body.length).to.equal(3);
    // cpa sorts desc
    let cpaPrev = 999999999;
    for (const job of result.body) {
      const compareRes = cpaPrev > job.costPerApplication;
      expect(compareRes).to.equal(true);
      cpaPrev = job.costPerApplication;
    }
  });

  it('should default to alpha', async () => {
    const user = await factory.create('user', {}, { hasSession: true });

    const result = await request(app)
      .get('/v2/side_hustle_jobs')
      .set('Authorization', user.id)
      .set('X-Device-Id', user.id);

    expect(result.status).to.equal(200);
    expect(result.body.length).to.equal(3);
    let prev = 'a';
    for (const job of result.body) {
      const compareRes = prev.localeCompare(job.name);
      expect(compareRes).to.equal(-1);
      prev = job.name;
    }
  });
});
