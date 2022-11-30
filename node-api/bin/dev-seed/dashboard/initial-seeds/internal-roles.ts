import { Op } from 'sequelize';
import { InternalRole } from '../../../../src/models';

const roleNames = [
  'bankAdmin',
  'bankLead',
  'bankManager',
  'bankSupport',
  'overdraftAdmin',
  'overdraftLead',
  'overdraftManager',
  'overdraftSupport',
  'bulkUpdateAdmin',
];

export function up() {
  const data = roleNames.map(name => ({ name, deleted: null }));

  return InternalRole.bulkCreate(data, { updateOnDuplicate: ['deleted'] });
}

export async function down() {
  return InternalRole.destroy({
    where: {
      name: {
        [Op.in]: roleNames,
      },
    },
  });
}
