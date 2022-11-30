import { sequelize } from '../../src/models';

export default async function cleanDatabase({ skip }: { skip: string[] } = { skip: [] }) {
  const skippedTableNames = ['migrations', 'role', 'notification', 'user_setting_name', ...skip];
  const tables = await sequelize.getQueryInterface().showAllTables();

  return sequelize.transaction(async t => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });

    const cleans = tables.reduce((acc, table) => {
      if (!skippedTableNames.includes(table)) {
        acc.push(sequelize.query(`DELETE FROM ${table}`, { transaction: t }));
      }

      return acc;
    }, []);

    await Promise.all(cleans);

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });
  });
}
