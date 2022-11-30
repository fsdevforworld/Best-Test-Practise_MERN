import { HustleSortOrder, HustlePartner } from '@dave-inc/wire-typings';
import factory from '../../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import { createHustleJobPack } from '../../../../src/domain/hustle/job-pack';
import { SIDE_HUSTLE_SORT_FIELDS } from '../../../../src/api/v2/side-hustle/jobs/constants';
import {
  AuditLog,
  HustleJobPack,
  HustleJobPackSearch,
  HustleJobPackProvider,
  SideHustleProvider,
  User,
} from '../../../../src/models';

describe('createHustleJobPack', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should create a job pack with associated searches and providers', async () => {
    const user = await factory.create<User>('user');
    const sideHustleProvider = await factory.create<SideHustleProvider>('side-hustle-provider', {
      name: HustlePartner.Dave,
    });

    const hustleJobPack = await createHustleJobPack({
      name: 'Lyft Driver Job Pack',
      searchTerms: [
        { term: 'keyword', value: 'driver' },
        { term: 'employer', value: 'lyft' },
      ],
      sortOrder: HustleSortOrder.ASC,
      sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
      providers: [HustlePartner.Dave],
      image: '0xaaaaaa',
      bgColor: 'ff0000',
      userId: user.id,
    });

    const [auditLog, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
      AuditLog.findOne({ where: { userId: user.id, type: 'HUSTLE_JOB_CREATED' } }),
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

  it('should rollback all changes if an error occurs call fails', async () => {
    const user = await factory.create('user');
    await factory.create<SideHustleProvider>('side-hustle-provider', {
      name: HustlePartner.Dave,
    });

    sandbox.stub(HustleJobPackProvider, 'bulkCreate').rejects();

    await expect(
      createHustleJobPack({
        name: 'Lyft Driver Job Pack',
        searchTerms: [
          { term: 'keyword', value: 'driver' },
          { term: 'employer', value: 'lyft' },
        ],
        sortOrder: HustleSortOrder.ASC,
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
        providers: [HustlePartner.Dave, HustlePartner.Appcast],
        image: '0xaaaaaa',
        bgColor: 'ff0000',
        userId: user.id,
      }),
    ).to.be.rejected;

    const [hustleJobPacks, hustleJobPackSearches, hustleJobPackProviders] = await Promise.all([
      HustleJobPack.findAll(),
      HustleJobPackSearch.findAll(),
      HustleJobPackProvider.findAll(),
    ]);

    expect(hustleJobPacks).to.be.empty;
    expect(hustleJobPackSearches).to.be.empty;
    expect(hustleJobPackProviders).to.be.empty;
  });
});
