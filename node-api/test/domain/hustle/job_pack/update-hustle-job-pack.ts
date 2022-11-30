import { HustleSortOrder, HustlePartner } from '@dave-inc/wire-typings';
import factory from '../../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import { updateHustleJobPack } from '../../../../src/domain/hustle/job-pack';
import { SIDE_HUSTLE_SORT_FIELDS } from '../../../../src/api/v2/side-hustle/jobs/constants';
import {
  AuditLog,
  HustleJobPack,
  HustleJobPackSearch,
  HustleJobPackProvider,
  SideHustleProvider,
  User,
} from '../../../../src/models';

describe('updateHustleJobPack', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should update an existing job pack and remove old searches and providers attached to it', async () => {
    const user = await factory.create<User>('user');
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

    const updatedHustleJobPack = await updateHustleJobPack(hustleJobPack, updatePayload, user.id);

    const [auditLog, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
      AuditLog.findOne({
        where: { userId: user.id, type: AuditLog.TYPES.HUSTLE_JOB_PACK_UPDATED },
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

  it('should roll back any changes to the job pack if there is a failure', async () => {
    const user = await factory.create<User>('user');
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

    const updatePayload = {
      name: 'Jeff, Inc. LLC. Corp',
      searchTerms: [{ term: 'keyword', value: 'corp' }],
      sortOrder: HustleSortOrder.DESC,
      sortBy: SIDE_HUSTLE_SORT_FIELDS[1],
      providers: [HustlePartner.Appcast],
      image: '0x111',
      bgColor: 'ff1111',
    };
    sandbox.stub(HustleJobPackSearch, 'bulkCreate').rejects();

    // we do this because on failure, the object still mutates on the update and I want to keep the hustleJobPack for comparison down below
    const jobPack = await HustleJobPack.findByPk(hustleJobPack.id);
    await expect(updateHustleJobPack(jobPack, updatePayload, user.id)).to.be.rejected;

    const [
      auditLog,
      hustleJobPackSearches,
      hustleJobPackProviders,
      latestJobPack,
    ] = await Promise.all([
      AuditLog.findOne({ where: { userId: user.id, type: 'HUSTLE_JOB_UPDATED' } }),
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
