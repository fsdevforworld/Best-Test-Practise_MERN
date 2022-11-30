import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into payment_method
  (id, user_id, bank_account_id, availability, risepay_id, tabapay_id, mask, display_name, expiration, scheme, deleted, invalid) VALUES
  (2, 3, 2, 'immediate', 'external_payment_method_2', 'external_payment_method_2', '4112', 'Chase Visa: 4112', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (3, 3, 3, 'immediate', 'external_payment_method_3', 'external_payment_method_3', '4113', 'Chase Visa: 4113', current_timestamp + INTERVAL 1 MONTH, 'visa', null, null),
  (4, 5, 4, 'immediate', 'external_payment_method_4', 'external_payment_method_4', '4114', 'Chase Visa: 4114', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (5, 5, 5, 'immediate', 'external_payment_method_5', 'external_payment_method_5', '4115', 'Chase Visa: 4115', current_timestamp - INTERVAL 1 MONTH, 'visa', null, null),
  (6, 5, 6, 'immediate', 'external_payment_method_6', 'external_payment_method_6', '4116', 'Chase Visa: 4116', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (7, 6, 7, 'immediate', 'external_payment_method_7', 'external_payment_method_7', '4117', 'Chase Visa: 4117', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (8, 7, 8, 'immediate', 'external_payment_method_8', 'external_payment_method_8', '4118', 'Chase Visa: 4118', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (9, 9, 9, 'immediate', 'external_payment_method_9', 'external_payment_method_9', '4119', 'Chase Visa: 4119', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (10, 10, 10, 'immediate', 'external_payment_method_10', 'external_payment_method_10', '4110', 'Chase Visa: 4110', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (11, 11, 11, 'immediate', 'external_payment_method_11', 'external_payment_method_11', '4111', 'Chase Visa: 4111', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (12, 12, 12, 'immediate', 'external_payment_method_12', 'external_payment_method_12', '4112', 'Chase Visa: 4112', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (13, 13, 13, 'immediate', 'external_payment_method_13', 'external_payment_method_13', '4113', 'Chase Visa: 4113', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (14, 14, 14, 'immediate', 'external_payment_method_14', 'external_payment_method_14', '4114', 'Chase Visa: 4114', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),

  (1, 1, 1, 'immediate', 'external_payment_method_15', 'external_payment_method_15', '4112', 'Chase Visa: 4112', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (200, 200, 200, 'immediate', 'external_payment_method_200', 'external_payment_method_200', '4200', 'Chase Visa: 4200', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (500, 500, 500, 'immediate', 'external_payment_method_500', 'external_payment_method_500', '4500', 'Chase Visa: 4500', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (700, 700, 700, 'immediate', 'external_payment_method_700', 'external_payment_method_700', '4700', 'Chase Visa: 4700', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (702, 700, 702, 'immediate', 'external_payment_method_702', 'external_payment_method_702', '4702', 'Chase Visa: 4702', current_timestamp + INTERVAL 5 YEAR, 'visa', null, '2018-01-01 00:00:00'),
  (800, 800, 800, 'immediate', 'external_payment_method_800', 'external_payment_method_800', '4800', 'Chase Visa: 4800', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),

  (1300, 1300, 1300, 'immediate', 'external_payment_method_1300', 'external_payment_method_1300', '1300', 'Chase Visa: 1300', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (1400, 1400, 1400, 'immediate', 'external_payment_method_1400', 'external_payment_method_1400', '1400', 'Chase Visa: 1400', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),

  (1600, 1600, 1600, 'immediate', 'external_payment_method_1600', 'external_payment_method_1600', '1600', 'Chase Visa: 1600', current_timestamp + INTERVAL 5 YEAR, 'visa', '2018-03-20 10:30:58', null),
  (1700, 1700, 1700, 'immediate', 'external_payment_method_1700', 'external_payment_method_1700', '1700', 'Chase Visa: 1700', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (1800, 1800, 1800, 'immediate', 'external_payment_method_1800', 'external_payment_method_1800', '1800', 'Chase Visa: 1800', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),

  (2000, 2000, 2000, 'immediate', 'external_payment_method_2000', 'external_payment_method_2000', '2000', 'Chase Visa: 2000', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null),
  (2001, 2000, 2001, 'immediate', 'external_payment_method_2001', null, '2001', 'Wells MC: 2001', current_timestamp + INTERVAL 5 YEAR, 'mastercard', null, null),
  (2400, 2400, 2400, 'immediate', 'external_payment_method_2400', 'external_payment_method_2400', '2400', 'Chase Visa: 2400', current_timestamp + INTERVAL 5 YEAR, 'visa', null, null);
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

export default { up, upSql, tableName: 'payment_method' };
