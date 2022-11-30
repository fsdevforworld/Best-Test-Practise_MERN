import { moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const weekdaysLong: { [key: number]: string } = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function long(offset = 0) {
  return weekdaysLong[
    moment()
      .add(offset, 'days')
      .day()
  ];
}

const upSql = `INSERT INTO recurring_transaction
  (id, bank_account_id, user_id, transaction_display_name, \`interval\`, params, user_display_name, user_amount, dtstart, \`status\`)
  VALUES
  (100, 100, 100, 'Name 100', 'weekly', '["friday"]', 'Name 100', 50, '2018-01-01','VALID'),
  (101, 109, 100, 'Name 101', 'weekly', '["friday"]', 'Name 101', 50, CURRENT_DATE,'VALID'),
  (102, 109, 100, 'Name 102', 'weekly', '["wednesday"]', 'Name 102', 100, CURRENT_DATE,'VALID'),
  (103, 110, 100, 'Name 103', 'weekly', '["friday"]', 'Name 103', 50, CURRENT_DATE,'VALID'),
  (104, 104, 100, 'Name 110', 'weekly', '["${long(-2)}"]', 'Name 110', 1, CURRENT_DATE,'VALID'),
  (105, 110, 100, 'Name 111', 'weekly', '["friday"]', 'Name 111', 2, CURRENT_DATE,'VALID'),
  (106, 110, 100, 'Name 112', 'weekly', '["friday"]', 'Name 112', 4, CURRENT_DATE,'VALID'),
  (110, 710, 100, 'Name 112', 'weekly', '["wednesday"]', 'Name 112', 500, CURRENT_DATE,'VALID'),
  (111, 710, 100, 'Name 113', 'weekly', '["friday"]', 'Name 113', 250, CURRENT_DATE,'VALID'),
  (112, 709, 100, 'Name 112', 'weekly', '["wednesday"]', 'Name 112', 500, CURRENT_DATE,'VALID'),
  (113, 709, 100, 'Name 113', 'weekly', '["friday"]', 'Name 113', 250, CURRENT_DATE,'VALID'),
  (114, 111, 100, 'Name 114', 'weekly', '["friday"]', 'Name 114', 100, CURRENT_DATE,'VALID'),
  (115, 113, 100, 'Name 115', 'weekly', '["friday"]', 'Name 115', 100, CURRENT_DATE,'VALID'),
  (116, 114, 100, 'Name 116', 'weekly', '["${long()}"]', 'Name 116', 100, CURRENT_DATE,'VALID'),
  (117, 706, 100, 'Name 117', 'weekly', '["${long()}"]', 'Name 117', 1, CURRENT_DATE,'VALID'),
  (118, 707, 100, 'Name 118', 'weekly', '["${long()}"]', 'Name 118', 2, CURRENT_DATE,'VALID'),
  (119, 707, 100, 'Name 119', 'weekly', '["${long()}"]', 'Name 119', 4, CURRENT_DATE,'VALID'),
  (120, 707, 100, 'Name 120', 'weekly', '["${long()}"]', 'Name 120', 8, CURRENT_DATE,'VALID'),
  (121, 115, 100, 'Name 121', 'weekly', '["${
    weekdaysLong[1]
  }"]', 'Name 121', 16, CURRENT_DATE,'VALID'),
  (122, 115, 100, 'Name 122', 'weekly', '["${
    weekdaysLong[5]
  }"]', 'Name 122', 32, CURRENT_DATE,'VALID'),
  (123, 125, 100, 'Name 121', 'weekly', '["${
    weekdaysLong[1]
  }"]', 'Name 121', 16, CURRENT_DATE,'VALID'),
  (124, 125, 100, 'Name 122', 'weekly', '["${
    weekdaysLong[5]
  }"]', 'Name 122', 32, CURRENT_DATE,'VALID'),
  (125, 707, 100, 'Name 125', 'weekly', '["${long()}"]', 'Name 125', -16, CURRENT_DATE,'VALID'),
  (126, 126, 100, 'Name 126', 'weekly', '["${long()}"]', 'Name 126', -16, CURRENT_DATE,'VALID'),
  (127, 126, 100, 'Name 127', 'weekly', '["${long()}"]', 'Name 127', -32, CURRENT_DATE,'VALID'),
  (140, 104, 100, 'Name 140', 'weekly', '["${long()}"]', 'Name 140', 32, CURRENT_DATE,'VALID'),
  (1200, 1200, 1200, 'Name BACON', 'monthly', '[5]', 'Name 1200', -50, CURRENT_DATE,'VALID'),
  (1201, 1200, 1200, 'Name 1201', 'monthly', '[5]', 'Name 1201', 50, CURRENT_DATE,'VALID'),
  (2200, 2200, 2200, 'Name 2200', 'monthly', '[5]', 'Name 2200', 2200, CURRENT_DATE,'VALID');
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

export default { upSql, up, tableName: 'recurring_transaction' };
