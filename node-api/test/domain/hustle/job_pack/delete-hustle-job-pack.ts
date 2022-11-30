import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import { deleteHustleJobPack } from '../../../../src/domain/hustle/job-pack';
import {
  AuditLog,
  HustleJobPack,
  HustleJobPackSearch,
  HustleJobPackProvider,
  User,
} from '../../../../src/models';

describe('deleteHustleJobPack', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should delete the job pack along with associated searches and providers', async () => {
    const user = await factory.create<User>('user');
    const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack');
    const [hustleJobPackSearch, hustleJobPackProvider] = await Promise.all([
      factory.create('hustle-job-pack-search', { hustleJobPackId: hustleJobPack.id }),
      factory.create('hustle-job-pack-provider', { hustleJobPackId: hustleJobPack.id }),
    ]);
    hustleJobPack.hustleJobPackSearches = [hustleJobPackSearch];
    hustleJobPack.hustleJobPackProviders = [hustleJobPackProvider];

    await deleteHustleJobPack(hustleJobPack, user.id);

    const [auditLog, jobPack, jobPackSearches, jobPackProviders] = await Promise.all([
      AuditLog.findOne({ where: { userId: user.id, type: 'HUSTLE_JOB_DELETED' } }),
      HustleJobPack.findByPk(hustleJobPack.id),
      HustleJobPackSearch.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
      HustleJobPackProvider.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
    ]);

    expect(auditLog).to.exist;
    expect(jobPack).to.be.null;
    expect(jobPackSearches).to.be.empty;
    expect(jobPackProviders).to.be.empty;
  });

  it('should rollback delete if an error occurs while deleting', async () => {
    const user = await factory.create<User>('user');
    const hustleJobPack = await factory.create<HustleJobPack>('hustle-job-pack');
    const [hustleJobPackSearch, hustleJobPackProvider] = await Promise.all([
      factory.create('hustle-job-pack-search', { hustleJobPackId: hustleJobPack.id }),
      factory.create('hustle-job-pack-provider', { hustleJobPackId: hustleJobPack.id }),
    ]);
    hustleJobPack.hustleJobPackSearches = [hustleJobPackSearch];
    hustleJobPack.hustleJobPackProviders = [hustleJobPackProvider];

    sandbox.stub(hustleJobPack, 'destroy').rejects();

    await expect(deleteHustleJobPack(hustleJobPack, user.id)).to.be.rejected;

    const [jobPack, jobPackSearches, jobPackProviders] = await Promise.all([
      HustleJobPack.findByPk(hustleJobPack.id),
      HustleJobPackSearch.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
      HustleJobPackProvider.findAll({ where: { hustleJobPackId: hustleJobPack.id } }),
    ]);

    expect(jobPack.id).to.be.eq(hustleJobPack.id);
    expect(jobPackSearches.length).to.be.eq(1);
    expect(jobPackSearches[0].id).to.be.eq(hustleJobPackSearch.id);
    expect(jobPackProviders.length).to.be.eq(1);
    expect(jobPackProviders[0].id).to.be.eq(hustleJobPackProvider.id);
  });
});
