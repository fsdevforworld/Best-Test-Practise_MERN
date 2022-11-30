import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `
  INSERT into advance
  (id, user_id, bank_account_id, payment_method_id, external_id, amount, disbursement_status, outstanding, fee, created, created_date, payback_date, deleted) VALUES
  (1, 3, 2, 2, 'external_advance_1', 50, 'COMPLETED', 0, 3.50, current_timestamp - INTERVAL 2 DAY, current_timestamp - INTERVAL 2 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (2, 5, 4, 4, 'external_advance_2', 50, 'COMPLETED', 53.50, 3.50, current_timestamp, current_timestamp, current_timestamp,'9999-12-31 23:59:59'),
  (3, 5, 4, 4, 'external_advance_3', 50, 'COMPLETED', 33.50, 3.50, current_timestamp - INTERVAL 1 WEEK, current_timestamp - INTERVAL 1 WEEK,  current_timestamp,'9999-12-31 23:59:59'),
  (4, 6, 7, 7, 'external_advance_4', 50, 'COMPLETED', 33.50, 3.50, current_timestamp - INTERVAL 1 MONTH, current_timestamp - INTERVAL 1 MONTH,  current_timestamp,'9999-12-31 23:59:59'),
  (5, 7, 8, 8, 'external_advance_5', 50, 'COMPLETED', 30.00, 5.00, current_timestamp - INTERVAL 1 WEEK, current_timestamp - INTERVAL 1 WEEK,  current_timestamp,'9999-12-31 23:59:59'),
  (6, 7, 8, 8, 'external_advance_6', 50, 'PENDING',  50.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp,'9999-12-31 23:59:59'),
  (9, 9, 9, 9, 'external_advance_9', 50, 'COMPLETED', 55.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp,'9999-12-31 23:59:59'),
  (11, 11, 11, 11, 'external_advance_11', 50, 'COMPLETED', 0.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp,'9999-12-31 23:59:59'),
  (12, 12, 12, 12, 'external_advance_12', 50, 'COMPLETED', 0, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp - INTERVAL 1 WEEK,'9999-12-31 23:59:59'),
  (13, 13, 13, 13, 'external_advance_13', 50, 'COMPLETED', 55.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp - INTERVAL 1 WEEK,'9999-12-31 23:59:59'),
  (14, 14, 14, 14, 'external_advance_14', 50, 'COMPLETED', 55.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp + INTERVAL 1 WEEK,'9999-12-31 23:59:59'),
  (15, 5, 6, 6, 'external_advance_15', 50, 'COMPLETED', 55.00, 5.00, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (700, 701, 703, NULL, 'external_advance_700', 50, 'COMPLETED', 55.00, 5.00, current_timestamp - INTERVAL 1 WEEK, current_timestamp - INTERVAL 1 WEEK,  current_timestamp,'9999-12-31 23:59:59'),
  (701, 701, 705, NULL, 'external_advance_705', 50, 'COMPLETED', 0.00, 5.00, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (800, 800, 800, 800, 'external_advance_800', 50, 'COMPLETED', 0.00, 5.00, current_timestamp - INTERVAL 1 WEEK, current_timestamp - INTERVAL 1 WEEK,  current_timestamp,'9999-12-31 23:59:59'),
  (801, 800, 801, NULL, 'external_advance_801', 50, 'COMPLETED', 0.00, 5.00, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY, current_timestamp - INTERVAL 1 WEEK - INTERVAL 1 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (802, 800, 800, 800, 'external_advance_802', 50, 'CANCELED', 0.00, 0.00, current_timestamp - INTERVAL 1 WEEK - INTERVAL 2 DAY, current_timestamp - INTERVAL 1 WEEK - INTERVAL 2 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (1800, 1800, 1800, 1800, 'external_advance_1800', 50, 'PENDING',  50.00, 5.00, current_timestamp - INTERVAL 1 HOUR, current_timestamp - INTERVAL 1 HOUR,  current_timestamp,'9999-12-31 23:59:59'),
  (1801, 1800, 1800, 1800, 'external_advance_1801', 50, 'PENDING',  50.00, 5.00, current_timestamp - INTERVAL 1 HOUR - INTERVAL 1 DAY, current_timestamp - INTERVAL 1 HOUR - INTERVAL 1 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (1802, 1800, 1800, 1800, 'external_advance_1802', 50, 'PENDING',  50.00, 5.00, current_timestamp - INTERVAL 1 HOUR - INTERVAL 2 DAY, current_timestamp - INTERVAL 1 HOUR - INTERVAL 2 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (1803, 1800, 1800, 1800, 'external_advance_1803', 50, 'PENDING',  50.00, 5.00, current_timestamp - INTERVAL 1 HOUR - INTERVAL 3 DAY, current_timestamp - INTERVAL 1 HOUR - INTERVAL 3 DAY,  current_timestamp,'9999-12-31 23:59:59'),
  (2400, 2400, 2400, 2400, 'external_advance_2400', 50, 'CANCELED', 0.00, 0.00, current_timestamp - INTERVAL 1 WEEK - INTERVAL 2 DAY, current_timestamp - INTERVAL 1 WEEK - INTERVAL 2 DAY,  current_timestamp,'9999-12-31 23:59:59');
  INSERT into advance
  (id, user_id, bank_account_id, payment_method_id, external_id, amount, disbursement_status, outstanding, fee, created, created_date, payback_date, deleted) VALUES
  (2401, 2400, 2400, 2400, 'external_advance_2401',  5, 'COMPLETED',  7.99, 1.99, current_timestamp - INTERVAL 40 DAY, current_timestamp - INTERVAL 40 DAY,  current_timestamp - INTERVAL 37 DAY,'9999-12-31 23:59:59'),
  (2402, 2400, 2400, 2400, 'external_advance_2402', 10, 'COMPLETED', 13.99, 1.99, current_timestamp - INTERVAL 35 DAY, current_timestamp - INTERVAL 35 DAY,  current_timestamp - INTERVAL 32 DAY,'9999-12-31 23:59:59'),
  (2403, 2400, 2400, 2400, 'external_advance_2403', 15, 'COMPLETED', 19.99, 1.99, current_timestamp - INTERVAL 30 DAY, current_timestamp - INTERVAL 30 DAY,  current_timestamp - INTERVAL 27 DAY,'9999-12-31 23:59:59'),
  (2404, 2400, 2400, 2400, 'external_advance_2404', 50, 'COMPLETED', 58.50, 3.50, current_timestamp - INTERVAL 25 DAY, current_timestamp - INTERVAL 25 DAY,  current_timestamp - INTERVAL 22 DAY,'9999-12-31 23:59:59'),
  (2405, 2400, 2400, 2400, 'external_advance_2405', 15, 'COMPLETED', 16.99, 1.99, current_timestamp - INTERVAL 20 DAY, current_timestamp - INTERVAL 20 DAY,  current_timestamp - INTERVAL 17 DAY,'9999-12-31 23:59:59'),
  (2406, 2400, 2400, 2400, 'external_advance_2406', 50, 'COMPLETED', 58.50, 3.50, current_timestamp - INTERVAL 15 DAY, current_timestamp - INTERVAL 15 DAY,  current_timestamp - INTERVAL 12 DAY,'9999-12-31 23:59:59');

  INSERT into advance_tip
  (id, advance_id, amount, percent) VALUES
  (1, 1, 0, 0),
  (2, 2, 0, 0),
  (3, 3, 0, 0),
  (4, 4, 0, 0),
  (5, 5, 0, 0),
  (6, 6, 0, 0),
  (9, 9, 0, 0),
  (11, 11, 0, 0),
  (12, 12, 0, 0),
  (13, 13, 0, 0),
  (14, 14, 0, 0),
  (15, 15, 0, 0),
  (700, 700, 0, 0),
  (701, 701, 0, 0),
  (800, 800, 0, 0),
  (801, 801, 0, 0),
  (802, 802, 0, 0),
  (1800, 1800, 0, 0),
  (1801, 1801, 0, 0),
  (1802, 1802, 0, 0),
  (1803, 1803, 0, 0),
  (2400, 2400, 0, 0),
  (2401, 2401, 1, 20),
  (2402, 2402, 2, 20),
  (2403, 2403, 3, 20),
  (2404, 2404, 5, 10),
  (2405, 2405, 0, 0),
  (2406, 2406, 0, 0);
`;

const tableName = 'advance';

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

export default { up, upSql, tableName };
