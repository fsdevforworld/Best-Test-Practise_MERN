import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into payment
  (id, advance_id, user_id, bank_account_id, payment_method_id, amount, external_id, status, created, bank_transaction_id) VALUES
  (1, 4, 6, NULL, 7, 20, 'external_payment_1', 'COMPLETED', DATE_FORMAT(NOW() - INTERVAL 1 day,'%Y-%m-%d'), NULL),
  (2, 5, 7, NULL, 8, 20, 'external_payment_2', 'PENDING', DATE_FORMAT(NOW() - INTERVAL 1 day,'%Y-%m-%d'), NULL),
  (3, 1, 3, NULL, 8, 20, 'external_payment_3', 'COMPLETED', DATE_FORMAT(NOW() - INTERVAL 3 day,'%Y-%m-%d'), NULL),
  (4, 1, 200, 201, NULL, 75, 'external_payment_4', 'COMPLETED', DATE_FORMAT(NOW() - INTERVAL 3 day,'%Y-%m-%d'), 242),
  (5, 1, 200, 201, NULL, 75, 'external_payment_5', 'COMPLETED', '2017-07-16', 239),
  (6, 1, 200, 201, NULL, 75, 'external_payment_6', 'COMPLETED', '2017-08-01', 238);
  `;

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

export default { up, upSql, tableName: 'payment' };
