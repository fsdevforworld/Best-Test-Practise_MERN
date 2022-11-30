import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const upSql = `INSERT INTO alert
  (id, user_id, event_uuid, type, subtype, created)
  VALUES
  (400, 400, 407, 'SMS', 'OVERDRAFT', NOW()),
  (401, 400, 408, 'SMS', 'PENDING_OVERDRAFT', NOW()),
  (402, 400, 409, 'SMS', 'POTENTIAL_OVERDRAFT', NOW());
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

const tableName = 'alert';

export default { up, tableName, upSql };
