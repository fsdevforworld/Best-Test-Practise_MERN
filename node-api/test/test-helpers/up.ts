import { sequelize } from '../../src/models';
import { noKeyChecks } from '../fixtures/helper';
import getFixtures from './get-fixtures';

export default async function up(providedFixtures?: any[] | any | MochaDone): Promise<void> {
  const upFunctions: Array<() => PromiseLike<any>> = [];
  const upQueries: string[] = [];
  getFixtures(providedFixtures).forEach((f: any) => {
    if (f.upSql) {
      upQueries.push(f.upSql);
    } else if (f.up) {
      upFunctions.push(f.up);
    }
  });
  const query = noKeyChecks(upQueries.join('\n'));

  await sequelize.query(query);
  await Promise.all(upFunctions.map(func => func()));
}
