import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into onboarding_step
  (user_id, step)
  VALUES
  (1000, 'debit_card');
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

export default { up, upSql, tableName: 'onboarding_step' };
