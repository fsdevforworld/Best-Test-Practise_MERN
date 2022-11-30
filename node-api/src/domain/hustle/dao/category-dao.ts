import { Op } from 'sequelize';
import { SideHustleCategory } from '../../../models';
import { HustleCategoryConfig } from '../types';
import { mapCategoryModelToDomain } from '../utils';

async function queryDb() {
  return SideHustleCategory.findAll({
    attributes: ['name', 'priority', 'image'],
    order: [['name', 'ASC']],
    where: {
      name: {
        [Op.ne]: 'Default',
      },
    },
  });
}

export async function getCategories(): Promise<HustleCategoryConfig[]> {
  const categoriesFromDb = await queryDb();
  return categoriesFromDb.map(mapCategoryModelToDomain);
}
