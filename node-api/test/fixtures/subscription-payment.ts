import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `
INSERT INTO subscription_payment
  (id, user_id, bank_account_id, amount, external_processor, external_id, status, created)
  VALUES
  (24, 24, 24, 1.00, 'risepay', 'external_payment_24', 'returned', NOW() - INTERVAL 1 DAY),
  (25, 25, 25, 1.00, 'risepay', 'external_payment_25', 'pending', NOW() - INTERVAL 1 DAY),
  (26, 26, 26, 1.00, 'risepay', 'external_payment_26', 'completed', NOW() - INTERVAL 1 DAY),
  (27, 27, 27, 1.00, 'risepay', 'external_payment_27', 'returned', NOW() - INTERVAL 45 DAY),
  (28, 28, 28, 1.00, 'risepay', 'external_payment_28', 'pending', NOW() - INTERVAL 45 DAY),
  (29, 29, 29, 1.00, 'risepay', 'external_payment_29', 'completed', NOW() - INTERVAL 45 DAY),
  (200, 205, 1, 1.00, 'risepay', 'external_payment_200', 'completed', '2018-01-15 00:00:00'),
  (201, 205, 1, 1.00, 'risepay', 'external_payment_201', 'pending', '2018-01-16 00:00:00'),
  (202, 205, 1, 1.00, 'risepay', 'external_payment_202', 'canceled', '2018-01-17 00:00:00'),
  (203, 206, 1, 1.00, 'risepay', 'external_payment_203', 'returned', '2018-01-18 00:00:00'),
  (204, 207, 1, 1.00, 'risepay', 'external_payment_204', 'unknown', '2018-01-18 00:00:00'),
  (205, 208, 1, 1.00, 'risepay', 'external_payment_205', 'completed', '2018-01-18 00:00:00'),
  (206, 209, 1, 1.00, 'risepay', 'external_payment_206', 'pending', '2018-01-18 00:00:00'),
  (207, 210, 1, 1.00, 'risepay', 'external_payment_207', 'canceled', '2018-01-18 00:00:00'),
  (208, 211, 1, 1.00, 'risepay', 'external_payment_208', 'completed', '2017-12-31 00:00:00'),

  (1400, 1400, 1400, 1.00, 'risepay', 'external_payment_1400', 'completed', NOW() - INTERVAL 45 DAY);
`;

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

export default { up, upSql, tableName: 'subscription_payment' };
