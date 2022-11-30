import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import { getAllHustleJobPacks } from '../../../../src/domain/hustle/job-pack';

describe('getAllHustleJobPacks', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should return all HustleJobPacks', async () => {
    await Promise.all([factory.create('hustle-job-pack'), factory.create('hustle-job-pack')]);

    const hustleJobPacks = await getAllHustleJobPacks();
    expect(hustleJobPacks.length).to.be.eq(2);
    hustleJobPacks.forEach(hustleJobPack => {
      expect(hustleJobPack.name).to.exist;
      expect(hustleJobPack.sortBy).to.exist;
      expect(hustleJobPack.sortOrder).to.exist;
      expect(hustleJobPack.bgColor).to.exist;
      expect(hustleJobPack.image).to.exist;
    });
  });

  it('should return an empty array if there is no HustleJobPacks', async () => {
    const hustleJobPacks = await getAllHustleJobPacks();
    expect(hustleJobPacks).to.be.empty;
  });
});
