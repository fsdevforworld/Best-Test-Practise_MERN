import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = buildUpSql();

function buildUpSql() {
  // use actual timezone date for current date
  const curdate = moment()
    .tz(DEFAULT_TIMEZONE)
    .format('YYYY-MM-DD');
  return `
  INSERT INTO expected_transaction
  (id, user_id, bank_account_id, pending_display_name, display_name, expected_date, expected_amount, status, recurring_transaction_id, pending_date)
  VALUES
  (1, 3, 2, 'Name 1', 'Name 1', CURRENT_DATE + INTERVAL 5 DAY, 500, 'PREDICTED', null, null),
  (2, 31, 31, 'Name 2', 'Name 2', CURRENT_DATE + INTERVAL 5 DAY, 500, 'PREDICTED', null, null),
  (126, 100, 114, 'Name 126', 'Name 126', CURRENT_DATE + INTERVAL 1 DAY, 50, 'PREDICTED', null, null),
  (125, 100, 114, 'Name 127', 'Name 127', CURRENT_DATE + INTERVAL 2 DAY, 250, 'PREDICTED', null, null),
  (129, 100, 709, 'Name 112', 'Name 112', CURRENT_DATE + INTERVAL 1 DAY, 500, 'PREDICTED', 112, null),
  (130, 100, 709, 'Name 113', 'Name 113', CURRENT_DATE + INTERVAL 3 DAY, 250, 'PREDICTED', 113, null),
  (131, 100, 710, 'Name 112', 'Name 112', CURRENT_DATE + INTERVAL 1 DAY, 500, 'PREDICTED', 110, null),
  (132, 100, 710, 'Name 113', 'Name 113', CURRENT_DATE + INTERVAL 3 DAY, 250, 'PREDICTED', 111, null),
  (133, 100, 125, 'Name 121', 'Name 121', CURRENT_DATE + INTERVAL 4 DAY, 250, 'PREDICTED', 123, null),
  (134, 100, 125, 'Name 122', 'Name 122', CURRENT_DATE + INTERVAL 7 DAY, 500, 'PREDICTED', 124, null),
  (135, 100, 115, 'Name 122', 'Name 122', CURRENT_DATE + INTERVAL 16 DAY, 500, 'PREDICTED', 121, null),
  (136, 100, 115, 'Name 122', 'Name 122', CURRENT_DATE + INTERVAL 7 DAY, 500, 'PREDICTED', 122, null),
  (137, 100, 113, 'Name 122', 'Name 122', CURRENT_DATE + INTERVAL 6 DAY, 300, 'PREDICTED', 115, null),
  (138, 100, 110, 'Name 103', 'Name 103', CURRENT_DATE + INTERVAL 6 DAY, 300, 'PREDICTED', 103, null),
  (139, 100, 110, 'Name 104', 'Name 104', CURRENT_DATE + INTERVAL 6 DAY, 300, 'PREDICTED', 104, null),
  (140, 100, 110, 'Name 105', 'Name 105', CURRENT_DATE + INTERVAL 6 DAY, 300, 'PREDICTED', 105, null),
  (141, 100, 110, 'Name 106', 'Name 106', CURRENT_DATE + INTERVAL 6 DAY, 300, 'PREDICTED', 106, null),
  (142, 100, 110, 'Name 107', 'Name 107', CURRENT_DATE - INTERVAL 2 DAY, 300, 'PREDICTED', 106, null),
  (100, 100, 102, 'Name 100', 'Name 100', '${curdate}', -20, 'PREDICTED', 105, null),
  (101, 100, 103, 'Name 101', 'Name 101', '${curdate}', -20, 'PREDICTED', 106, null),
  (102, 100, 104, 'Name 102', 'Name 102', CURRENT_DATE + INTERVAL 1 DAY, -20, 'PREDICTED', 100, null),
  (108, 100, 106, 'Name 108', 'Name 108', CURRENT_DATE + INTERVAL 4 DAY, -20, 'PREDICTED', 101, null),
  (109, 100, 106, 'Name 109', 'Name 109', CURRENT_DATE + INTERVAL 4 DAY, -20, 'PREDICTED', 105, null),
  (112, 100, 110, 'Name 112', 'Name 112', "${curdate}", -1, 'PREDICTED', 103, null),
  (113, 100, 110, 'Name 113', 'Name 113', CURRENT_DATE - INTERVAL 7 DAY, -2, 'PREDICTED', 103, null),
  (114, 100, 110, 'Name 114', 'Name 114', CURRENT_DATE + INTERVAL 7 DAY, -4, 'PREDICTED', 103, null),
  (115, 100, 111, 'Name 115', 'Name 115', "${curdate}", -1, 'PREDICTED', 108, null),
  (116, 100, 111, 'Name 116', 'Name 116', "${curdate}", -2, 'PREDICTED', 109, null),
  (117, 100, 112, 'Name 117', 'Name 117', "${curdate}", -2, 'PREDICTED', 110, null),
  (118, 100, 113, 'Name 118', 'Name 118', "${curdate}", -1, 'PREDICTED', 111, null),
  (119, 100, 113, 'Name 119', 'Name 119', CURRENT_DATE + INTERVAL 1 DAY, -2, 'PREDICTED', 123, null),
  (120, 100, 113, 'Name 120', 'Name 120', CURRENT_DATE + INTERVAL 2 DAY, -4, 'PREDICTED', 113, null),
  (121, 100, 113, 'Name 121', 'Name 121', CURRENT_DATE + INTERVAL 3 DAY, -8, 'PREDICTED', 114, null),
  (122, 100, 113, 'Name 122', 'Name 122', CURRENT_DATE + INTERVAL 4 DAY, -16, 'PREDICTED', 115, null),
  (123, 100, 113, 'Name 123', 'Name 123', CURRENT_DATE + INTERVAL 5 DAY, -32, 'PREDICTED', 116, null),
  (124, 100, 113, 'Name 124', 'Name 124', CURRENT_DATE + INTERVAL 6 DAY, -64, 'PREDICTED', 117, null),
  (5, 100, 113, 'Name 125', 'Name 125', CURRENT_DATE + INTERVAL 7 DAY, -128, 'PREDICTED', 118, null),
  (127, 100, 114, 'Name 127', 'Name 127', "${curdate}", -1, 'PREDICTED', 123, null),
  (128, 100, 114, 'Name 128', 'Name 128', CURRENT_DATE + INTERVAL 1 DAY, -2, 'PREDICTED', 119, null),
  (6, 100, 126, 'Name 129', 'Name 129', CURRENT_DATE + INTERVAL 3 DAY, -16, 'PREDICTED', 120, null),
  (7, 100, 126, 'Name 130', 'Name 130', CURRENT_DATE + INTERVAL 3 DAY, -32, 'PREDICTED', 121, null),
  (300, 300, 300, 'Name 300', 'Name 300', CURRENT_DATE + INTERVAL 4 DAY, -20, 'PREDICTED', 122, null);
`;
}

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

export default { up, upSql, tableName: 'expected_transaction' };
