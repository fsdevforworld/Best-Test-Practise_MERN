import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into user_session
  (token, user_id, device_id, device_type)
  VALUES
  ('344496a0-36b3-4f36-8b7e-59fa29fb1af3', 1, '4N0bDpOdsiykLFKa', 'android'),
  ('96bc40bd-9fd0-43f3-84ac-27c80f322a08', 2, 'GtbuUNOR8lZOb5BU', 'ios'),
  ('token-3', 3, 'id-3', 'ios'),
  ('token-4', 4, 'id-4', 'ios'),
  ('token-5', 5, 'id-5', 'ios'),
  ('token-6', 6, 'id-6', 'ios'),
  ('token-8', 8, 'id-8', 'ios'),
  ('token-9', 9, 'id-9', 'ios'),
  ('token-10', 10, 'id-10', 'ios'),
  ('token-11', 11, 'id-11', 'ios'),
  ('token-22', 22, 'id-22', 'ios'),
  ('token-31', 31, 'id-31', 'ios'),
  ('token-32', 32, 'id-32', 'ios'),
  ('token-33', 33, 'id-33', 'ios'),
  ('token-200', 200, 'id-200', 'ios'),
  ('token-300', 300, 'id-300', 'ios'),
  ('token-400', 400, 'id-400', 'ios'),
  ('token-500', 500, 'id-500', 'ios'),
  ('token-600', 600, 'id-600', 'ios'),
  ('token-700', 700, 'id-700', 'ios'),
  ('token-701', 701, 'id-701', 'ios'),
  ('token-702', 702, 'id-702', 'ios'),
  ('token-703', 703, 'id-703', 'ios'),
  ('token-800', 800, 'id-800', 'ios'),
  ('token-900', 900, 'id-900', 'ios'),
  ('token-901', 901, 'id-901', 'ios'),
  ('token-902', 902, 'id-902', 'ios'),
  ('token-903', 903, 'id-903', 'ios'),
  ('token-1000', 1000, 'id-1000', 'ios'),
  ('token-1100', 1100, 'id-1100', 'ios'),
  ('token-1200', 1200, 'id-1200', 'ios'),
  ('token-2400', 2400, 'id-2400', 'ios'),
  ('token-2500', 2500, 'id-2500', 'ios'),
  ('token-2600', 2600, 'id-2600', 'ios');
  `;

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

export default { up, upSql, tableName: 'user_session' };
