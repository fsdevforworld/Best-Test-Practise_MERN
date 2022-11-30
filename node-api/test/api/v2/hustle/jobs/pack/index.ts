import { HustleJobPackResponse, HustleSortOrder, HustlePartner } from '@dave-inc/wire-typings';
import { factory } from 'factory-girl';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../../../../src/api';
import { clean } from '../../../../../test-helpers';
import { SIDE_HUSTLE_SORT_FIELDS } from '../../../../../../src/api/v2/side-hustle/jobs/constants';
import {
  AuditLog,
  InternalUser,
  InternalRole,
  HustleJobPack,
  HustleJobPackSearch,
  HustleJobPackProvider,
  SideHustleProvider,
  User,
} from '../../../../../../src/models';
import { ALL_ADMIN_INTERNAL_ROLES } from '../../../../../../src/models/internal-role';

describe('/v2/hustles/job_pack/*', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  async function createAdminUser(): Promise<User> {
    const user = await factory.create<User>('user');
    const [internalUser, internalRole] = await Promise.all([
      factory.create<InternalUser>('internal-user', { id: user.id }),
      factory.create<InternalRole>('internal-role', {
        name: ALL_ADMIN_INTERNAL_ROLES[0],
      }),
    ]);
    await internalUser.setInternalRoles([internalRole]);
    return user;
  }

  describe('POST /v2/hustles/job_pack', () => {
    let adminUser: User;

    beforeEach(async () => {
      adminUser = await createAdminUser();
    });

    it.skip('should return successfully with a job pack and create associated search and providers', async () => {
      const sideHustleProvider = await factory.create<SideHustleProvider>('side-hustle-provider', {
        name: HustlePartner.Dave,
      });

      const response = await request(app)
        .post('/v2/hustles/job_pack')
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send({
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
          sortOrder: HustleSortOrder.ASC,
          providers: [HustlePartner.Dave],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        });

      const hustleJobPack = response.body;

      const [auditLog, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
        AuditLog.findOne({ where: { userId: adminUser.id, type: 'HUSTLE_JOB_CREATED' } }),
        HustleJobPackSearch.findAll(),
        HustleJobPackProvider.findAll(),
      ]);

      expect(auditLog).to.exist;

      const sortedJobPackSearches = hustleJobPackSearches.sort((jobPackSearchA, jobPackSearchB) =>
        jobPackSearchA.term.localeCompare(jobPackSearchB.term),
      );

      expect(hustleJobPack.name).to.be.eq('Lyft Driver Job Pack');

      expect(hustleJobPackSearches.length).to.be.eq(2);
      expect(sortedJobPackSearches[0].term).to.be.eq('employer');
      expect(sortedJobPackSearches[0].value).to.be.eq('lyft');
      expect(sortedJobPackSearches[1].term).to.be.eq('keyword');
      expect(sortedJobPackSearches[1].value).to.be.eq('driver');

      expect(hustleJobPackProviders.length).to.be.eq(1);
      expect(hustleJobPackProviders[0].hustleJobPackId).to.be.eq(hustleJobPack.id);
      expect(hustleJobPackProviders[0].sideHustleProviderId).to.be.eq(sideHustleProvider.id);
    });

    it.skip('should return a UnauthorizedError if user is not logged in as admin', async () => {
      const nonAdminUser = await factory.create<User>('user');
      const response = await request(app)
        .post('/v2/hustles/job_pack')
        .set('Authorization', `${nonAdminUser.id}`)
        .set('X-Device-Id', `${nonAdminUser.id}`)
        .send({
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
          sortOrder: HustleSortOrder.ASC,
          providers: ['Dave'],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        });

      expect(response.status).to.be.eq(403);
      expect(response.body.message).to.be.match(/User does not have permission/);
    });

    it.skip('should return a InvalidParametersError because it failed validation', async () => {
      const response = await request(app)
        .post('/v2/hustles/job_pack')
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send({
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortBy: `${SIDE_HUSTLE_SORT_FIELDS[0]}bbbbbb`,
          sortOrder: HustleSortOrder.ASC,
          providers: [HustlePartner.Dave],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        });

      expect(response.status).to.be.eq(400);
      expect(response.body.message).to.be.match(
        new RegExp(
          `${SIDE_HUSTLE_SORT_FIELDS[0]}bbbbbb is invalid for sorting Dave side hustles, only the following parameters are valid: ${SIDE_HUSTLE_SORT_FIELDS}`,
        ),
      );
    });

    it.skip('should roll back DB changes if there is an error when creating job pack', async () => {
      await factory.create<SideHustleProvider>('side-hustle-provider', {
        name: HustlePartner.Dave,
      });

      sandbox.stub(HustleJobPackProvider, 'bulkCreate').rejects();

      const response = await request(app)
        .post('/v2/hustles/job_pack')
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send({
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
          sortOrder: HustleSortOrder.ASC,
          providers: ['Dave'],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        });

      expect(response.status).to.be.eq(500);

      const [
        auditLog,
        hustleJobPacks,
        hustleJobPackSearches,
        hustleJobPackProviders,
      ] = await Promise.all([
        AuditLog.findOne({ where: { userId: adminUser.id, type: 'HUSTLE_JOB_CREATED' } }),
        HustleJobPack.findAll(),
        HustleJobPackSearch.findAll(),
        HustleJobPackProvider.findAll(),
      ]);

      expect(auditLog).to.not.exist;
      expect(hustleJobPacks).to.be.empty;
      expect(hustleJobPackSearches).to.be.empty;
      expect(hustleJobPackProviders).to.be.empty;
    });
  });

  describe('DELETE /v2/hustles/job_pack/:id', () => {
    let adminUser: User;

    beforeEach(async () => {
      adminUser = await createAdminUser();
    });

    it.skip('should return successfully and deleted the job pack and its associated searches and providers', async () => {
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack');
      await Promise.all([
        factory.create('hustle-job-pack-search', { hustleJobPackId: hustleJobPack.id }),
        factory.create('hustle-job-pack-provider', { hustleJobPackId: hustleJobPack.id }),
      ]);

      await request(app)
        .delete(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send()
        .expect(200);

      const [auditLog, jobPack, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
        AuditLog.findOne({ where: { userId: adminUser.id, type: 'HUSTLE_JOB_DELETED' } }),
        HustleJobPack.findByPk(hustleJobPack.id),
        HustleJobPackSearch.findAll(),
        HustleJobPackProvider.findAll(),
      ]);

      expect(auditLog).to.exist;
      expect(jobPack).to.not.exist;
      expect(hustleJobPackSearches).to.be.empty;
      expect(hustleJobPackProviders).to.be.empty;
    });

    it.skip('should return a UnauthorizedError if user is not logged in as admin', async () => {
      const nonAdminUser = await factory.create<User>('user');
      const response = await request(app)
        .delete('/v2/hustles/job_pack/1')
        .set('Authorization', `${nonAdminUser.id}`)
        .set('X-Device-Id', `${nonAdminUser.id}`)
        .send();

      expect(response.status).to.be.eq(403);
      expect(response.body.message).to.be.match(/User does not have permission/);
    });

    it.skip('should return a NotFoundError because a job pack could not be found with the given id', async () => {
      const response = await request(app)
        .delete(`/v2/hustles/job_pack/$1`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send();

      expect(response.status).to.be.eq(404);
      expect(response.body.message).to.be.match(/Hustle job pack not found/);
    });

    it.skip('should roll back DB changes if there is an error when deleting job pack', async () => {
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack');
      const [hustleJobPackSearch, hustleJobPackProvider] = await Promise.all([
        factory.create('hustle-job-pack-search', { hustleJobPackId: hustleJobPack.id }),
        factory.create('hustle-job-pack-provider', { hustleJobPackId: hustleJobPack.id }),
      ]);
      sandbox.stub(HustleJobPack.prototype, 'destroy').rejects();

      const response = await request(app)
        .delete(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send();

      expect(response.status).to.be.eq(500);

      const [auditLog, jobPack, jobPackSearches, jobPackProviders] = await Promise.all([
        AuditLog.findOne({ where: { userId: adminUser.id, type: 'HUSTLE_JOB_DELETED' } }),
        HustleJobPack.findByPk(hustleJobPack.id),
        HustleJobPackSearch.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
        HustleJobPackProvider.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
      ]);

      expect(auditLog).to.not.exist;
      expect(jobPack.id).to.be.eq(hustleJobPack.id);
      expect(jobPackSearches.length).to.be.eq(1);
      expect(jobPackSearches[0].id).to.be.eq(hustleJobPackSearch.id);
      expect(jobPackProviders.length).to.be.eq(1);
      expect(jobPackProviders[0].id).to.be.eq(hustleJobPackProvider.id);
    });
  });

  describe('PATCH /v2/hustles/job_pack/:id', () => {
    let adminUser: User;

    beforeEach(async () => {
      adminUser = await createAdminUser();
    });

    it.skip('should successfully update the job pack and its associated searches and providers', async () => {
      const sideHustleProviderDave = await factory.create<SideHustleProvider>(
        'side-hustle-provider',
        {
          name: HustlePartner.Dave,
        },
      );
      const sideHustleProviderAppcast = await factory.create<SideHustleProvider>(
        'side-hustle-provider',
        {
          name: HustlePartner.Appcast,
        },
      );
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack', {
        name: 'International House of Jeff',
        sortOrder: HustleSortOrder.ASC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        image: '0xaaaaaa',
        bgColor: 'ff0000',
      });
      const [hustleJobPackSearch, hustleJobPackProvider] = await Promise.all([
        factory.create('hustle-job-pack-search', {
          hustleJobPackId: hustleJobPack.id,
          term: 'keyword',
          value: 'driver',
        }),
        factory.create('hustle-job-pack-provider', {
          hustleJobPackId: hustleJobPack.id,
          sideHustleProviderId: sideHustleProviderDave.id,
        }),
      ]);
      hustleJobPack.hustleJobPackSearches = [hustleJobPackSearch];
      hustleJobPack.hustleJobPackProviders = [hustleJobPackProvider];

      const newSearchTerm = { term: 'keyword', value: 'corp' };
      const updatePayload = {
        name: 'Jeff, Inc. LLC. Corp',
        searchTerms: [newSearchTerm],
        sortOrder: HustleSortOrder.DESC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[1],
        providers: [HustlePartner.Appcast],
        image: '0x111',
        bgColor: 'ff1111',
      };

      const response = await request(app)
        .patch(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send(updatePayload)
        .expect(200);

      const updatedHustleJobPack = response.body;

      const [auditLog, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
        AuditLog.findOne({
          where: { userId: adminUser.id, type: AuditLog.TYPES.HUSTLE_JOB_PACK_UPDATED },
        }),
        HustleJobPackSearch.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
        HustleJobPackProvider.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
      ]);

      expect(auditLog).to.exist;

      expect(updatedHustleJobPack.name).to.be.eq(updatePayload.name);
      expect(updatedHustleJobPack.sortOrder).to.be.eq(updatePayload.sortOrder);
      expect(updatedHustleJobPack.sortBy).to.be.eq(updatePayload.sortBy);
      expect(updatedHustleJobPack.image).to.be.eq(updatePayload.image);
      expect(updatedHustleJobPack.bgColor).to.be.eq(updatePayload.bgColor);

      expect(hustleJobPackSearches.length).to.be.eq(1);
      expect(hustleJobPackSearches[0].term).to.be.eq(newSearchTerm.term);
      expect(hustleJobPackSearches[0].value).to.be.eq(newSearchTerm.value);

      expect(hustleJobPackProviders.length).to.be.eq(1);
      expect(hustleJobPackProviders[0].hustleJobPackId).to.be.eq(updatedHustleJobPack.id);
      expect(hustleJobPackProviders[0].sideHustleProviderId).to.be.eq(sideHustleProviderAppcast.id);
    });

    it.skip('should return a UnauthorizedError if user is not logged in as admin', async () => {
      const nonAdminUser = await factory.create<User>('user');
      const response = await request(app)
        .patch('/v2/hustles/job_pack/1')
        .set('Authorization', `${nonAdminUser.id}`)
        .set('X-Device-Id', `${nonAdminUser.id}`)
        .send({
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
          sortOrder: HustleSortOrder.ASC,
          providers: [HustlePartner.Dave],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        });

      expect(response.status).to.be.eq(403);
      expect(response.body.message).to.be.match(/User does not have permission/);
    });

    it.skip('should throw an InvalidParametersError if sortBy is an invalid value', async () => {
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack', {
        name: 'International House of Jeff',
        sortOrder: HustleSortOrder.ASC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        image: '0xaaaaaa',
        bgColor: 'ff0000',
      });

      const updatePayload = {
        name: 'Jeff, Inc. LLC. Corp',
        searchTerms: [{ term: 'keyword', value: 'corp' }],
        sortOrder: HustleSortOrder.DESC,
        sortBy: `${SIDE_HUSTLE_SORT_FIELDS[0]}jeff`,
        providers: [HustlePartner.Appcast],
        image: '0x111',
        bgColor: 'ff1111',
      };

      const response = await request(app)
        .patch(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send(updatePayload);

      expect(response.status).to.be.eq(400);
      expect(response.body.message).to.be.match(
        new RegExp(
          `${SIDE_HUSTLE_SORT_FIELDS[0]}jeff is invalid for sorting Dave side hustles, only the following parameters are valid: ${SIDE_HUSTLE_SORT_FIELDS}`,
        ),
      );
    });

    it.skip('should throw an InvalidParametersError if one of the required fields is missing', async () => {
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack', {
        name: 'International House of Jeff',
        sortOrder: HustleSortOrder.ASC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        image: '0xaaaaaa',
        bgColor: 'ff0000',
      });

      const updatePayload = {
        name: 'Jeff, Inc. LLC. Corp',
        searchTerms: [{ term: 'keyword', value: 'corp' }],
        sortOrder: HustleSortOrder.DESC,
        providers: [HustlePartner.Appcast],
        image: '0x111',
        bgColor: 'ff1111',
      };

      const response = await request(app)
        .patch(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send(updatePayload);

      expect(response.status).to.be.eq(400);
      expect(response.body.message).to.be.match(
        /Required parameters not provided: name, searchTerms, sortBy, sortOrder, providers, image, bgColor/,
      );
    });

    it.skip('should throw an NotFoundError if a job pack could not be found with the associated id', async () => {
      const updatePayload = {
        name: 'Jeff, Inc. LLC. Corp',
        searchTerms: [{ term: 'keyword', value: 'corp' }],
        sortOrder: HustleSortOrder.DESC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        providers: [HustlePartner.Appcast],
        image: '0x111',
        bgColor: 'ff1111',
      };

      const response = await request(app)
        .patch('/v2/hustles/job_pack/1')
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send(updatePayload);

      expect(response.status).to.be.eq(404);
      expect(response.body.message).to.be.match(/Hustle job pack not found/);
    });

    it.skip('should throw an error and roll back any changes to the job pack', async () => {
      const sideHustleProvider = await factory.create<SideHustleProvider>('side-hustle-provider', {
        name: HustlePartner.Dave,
      });
      const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack', {
        name: 'International House of Jeff',
        sortOrder: HustleSortOrder.ASC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        image: '0xaaaaaa',
        bgColor: 'ff0000',
      });
      const oldSearchTerms = { term: 'keyword', value: 'driver' };
      const [hustleJobPackSearch, hustleJobPackProvider] = await Promise.all([
        factory.create('hustle-job-pack-search', {
          hustleJobPackId: hustleJobPack.id,
          ...oldSearchTerms,
        }),
        factory.create('hustle-job-pack-provider', {
          hustleJobPackId: hustleJobPack.id,
          sideHustleProviderId: sideHustleProvider.id,
        }),
      ]);
      hustleJobPack.hustleJobPackSearches = [hustleJobPackSearch];
      hustleJobPack.hustleJobPackProviders = [hustleJobPackProvider];

      const newSearchTerm = { term: 'keyword', value: 'corp' };
      const updatePayload = {
        name: 'Jeff, Inc. LLC. Corp',
        searchTerms: [newSearchTerm],
        sortOrder: HustleSortOrder.DESC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[1],
        providers: [HustlePartner.Appcast],
        image: '0x111',
        bgColor: 'ff1111',
      };

      sandbox.stub(HustleJobPackSearch, 'bulkCreate').rejects();
      await request(app)
        .patch(`/v2/hustles/job_pack/${hustleJobPack.id}`)
        .set('Authorization', `${adminUser.id}`)
        .set('X-Device-Id', `${adminUser.id}`)
        .send(updatePayload)
        .expect(500);

      const [
        auditLog,
        hustleJobPackSearches,
        hustleJobPackProviders,
        latestJobPack,
      ] = await Promise.all([
        AuditLog.findOne({ where: { userId: adminUser.id, type: 'HUSTLE_JOB_UPDATED' } }),
        HustleJobPackSearch.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
        HustleJobPackProvider.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
        HustleJobPack.findByPk(hustleJobPack.id),
      ]);

      expect(auditLog).to.not.exist;

      expect(hustleJobPack.name).to.be.eq(latestJobPack.name);
      expect(hustleJobPack.sortOrder).to.be.eq(latestJobPack.sortOrder);
      expect(hustleJobPack.sortBy).to.be.eq(latestJobPack.sortBy);
      expect(hustleJobPack.image).to.be.eq(latestJobPack.image);
      expect(hustleJobPack.bgColor).to.be.eq(latestJobPack.bgColor);

      expect(hustleJobPackSearches.length).to.be.eq(1);
      expect(hustleJobPackSearches[0].term).to.be.eq(oldSearchTerms.term);
      expect(hustleJobPackSearches[0].value).to.be.eq(oldSearchTerms.value);

      expect(hustleJobPackProviders.length).to.be.eq(1);
      expect(hustleJobPackProviders[0].hustleJobPackId).to.be.eq(hustleJobPack.id);
      expect(hustleJobPackProviders[0].sideHustleProviderId).to.be.eq(sideHustleProvider.id);
    });
  });

  describe('GET /v2/hustles/job_pack', () => {
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
