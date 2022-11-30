import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../../../../../factories';
import { clean, createHustleIdFromSideHustle } from '../../../../../test-helpers';
import app from '../../../../../../src/api';
import { SideHustle, SideHustleSavedJob, User } from '../../../../../../src/models';

describe('DELETE /v2/hustles/saved_hustless (unsave)', () => {
  let user: User;

  before(() => clean());

  beforeEach(async () => {
    user = await factory.create('user');
  });

  afterEach(() => clean());

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
    let daveHustle: SideHustle;
    let appcastHustle: SideHustle;

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
