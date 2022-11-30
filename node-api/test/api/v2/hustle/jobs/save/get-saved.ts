import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import { clean, fakeDateTime, getHustleIdForSavedJob } from '../../../../../test-helpers';
import factory from '../../../../../factories';
import app from '../../../../../../src/api';
import { User, SideHustleSavedJob } from '../../../../../../src/models';

describe('GET /hustles/saved_hustles', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  it('should return all saved jobs for user in desc order by date updated', async () => {
    const user = await factory.create<User>('user');
    const latestSavedJob = await factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
      userId: user.id,
    });
    // create saved job in the past
    fakeDateTime(sandbox, moment().subtract(1, 'week'));
    const olderSavedJob = await factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
      userId: user.id,
    });

    const response = await request(app)
      .get(`/v2/hustles/saved_hustles`)
      .set('Authorization', `${user.id}`)
      .set('X-Device-Id', `${user.id}`);
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
    const user = await factory.create<User>('user');
    const response = await request(app)
      .get(`/v2/hustles/saved_hustles`)
      .set('Authorization', `${user.id}`)
      .set('X-Device-Id', `${user.id}`);
    expect(response.body).to.be.empty;
  });

  it('should throw InvalidSessionError if invalud auth credentials are provided', async () => {
    const user = await factory.create<User>('user');
    const response = await request(app)
      .get(`/v2/hustles/saved_hustles`)
      .set('Authorization', `${user.id}+9`)
      .set('X-Device-Id', `${user.id}+8`);
    expect(response.status).to.equal(401);
  });
});
