import { HustleSortOrder } from '@dave-inc/wire-typings';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import * as JobPackDao from '../../../../src/domain/hustle/dao/job-pack-dao';
import { HustleJobPack } from '../../../../src/domain/hustle/types';
import { expect } from 'chai';

describe('Side Hustle Job Pack Dao', () => {
  describe('findAll', () => {
    before(() => clean());
    afterEach(() => clean());

    const testJobPacks: Array<Partial<HustleJobPack>> = [
      {
        id: 1,
        name: 'Underwater Jobs',
        image: 's3://fakebucket/underwater.jpg',
        bgColor: 'blue',
        sortBy: 'cpc',
        sortOrder: HustleSortOrder.ASC,
      },
      {
        id: 2,
        name: 'Outer Space Jobs',
        image: 's3://fakebucket/space.jpg',
        bgColor: 'purple',
        sortBy: 'distance',
        sortOrder: HustleSortOrder.DESC,
      },
    ];

    it('should findAll job packs from the databse', async () => {
      for (const jobPack of testJobPacks) {
        await factory.create('hustle-job-pack', { ...jobPack });
      }
      const actualJobPacks = await JobPackDao.findAll();

      expect(actualJobPacks.length).equals(2);
      actualJobPacks.forEach(actualJobPack => {
        expect(actualJobPack).is.not.null;
        const actualId = actualJobPack.id;
        if (actualId === 1) {
          expect(actualJobPack.name).equals('Underwater Jobs');
          expect(actualJobPack.image).equals('s3://fakebucket/underwater.jpg');
          expect(actualJobPack.bgColor).equals('blue');
          expect(actualJobPack.sortBy).equals('cpc');
          expect(actualJobPack.sortOrder).equals(HustleSortOrder.ASC);
        } else if (actualId === 2) {
          expect(actualJobPack.name).equals('Outer Space Jobs');
          expect(actualJobPack.image).equals('s3://fakebucket/space.jpg');
          expect(actualJobPack.bgColor).equals('purple');
          expect(actualJobPack.sortBy).equals('distance');
          expect(actualJobPack.sortOrder).equals(HustleSortOrder.DESC);
        } else {
          expect.fail('Returned unexpected jobpack id.');
        }
      });
    });
  });
});
