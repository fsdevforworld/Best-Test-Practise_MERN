import { HustlePartner } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../../factories';
import {
  clean,
  createHustleIdFromSideHustle,
  fakeDateTime,
  replayHttp,
} from '../../../../../test-helpers';
import app from '../../../../../../src/api';
import { constructJobIdStrings } from '../../../../../../src/domain/hustle';
import AppcastClient from '../../../../../../src/lib/appcast';
import { SideHustle, SideHustleSavedJob, User } from '../../../../../../src/models';

describe('/hustles/saved_hustles', () => {
  let user: User;
  let daveHustle: SideHustle;
  let appcastHustle: SideHustle;
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));
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
