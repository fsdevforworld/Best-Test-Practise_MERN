import { HustleCategory } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import * as CategoryDao from '../../../../src/domain/hustle/dao/category-dao';
import { HustleCategoryConfig } from '../../../../src/domain/hustle/types';

describe('Side Hustle Category Dao', () => {
  describe('getCategories', () => {
    before(() => clean());
    afterEach(() => clean());

    const categories = [
      { name: 'Business Opportunity', image: 'bo_url', priority: 2 },
      { name: 'Science', image: 'science_url', priority: 1 },
      { name: 'Allied Health Healthcare', image: 'healthcare_url', priority: 1 },
      { name: 'Default', image: 'default_url', priority: 10 },
    ];

    const expectedCategories: HustleCategoryConfig[] = [
      { name: HustleCategory.ALLIED_HEALTH_HEALTHCARE, image: 'healthcare_url', priority: 1 },
      { name: HustleCategory.BUSINESS_OPPORTUNITY, image: 'bo_url', priority: 2 },
      { name: HustleCategory.SCIENCE, image: 'science_url', priority: 1 },
    ];

    it('should query the database for categories then return them in alphaetical order', async () => {
      for (const category of categories) {
        await factory.create('side-hustle-category', { ...category });
      }
      const categeryResponse = await CategoryDao.getCategories();
      expect(categeryResponse).to.deep.equal(expectedCategories);
    });
  });
});
