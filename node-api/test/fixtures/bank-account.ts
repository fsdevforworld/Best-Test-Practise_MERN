import { sequelize } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into bank_account
  (id, user_id, institution_id, bank_connection_id, external_id, synapse_node_id, display_name, current, available, type, subtype, account_number, updated, account_number_aes256, last_four, main_paycheck_recurring_transaction_id, deleted, default_payment_method_id)
  VALUES
  (1, 1, 2, 2, 'external_1', NULL, 'Account 1', 100, 100, 'depository', 'checking', 'aa2755ce4b834951da30453c3392fd67071b3919c1454b47de33eeb556cf93cf', current_timestamp, '001|001', '1111', null, null, 1),
  (2, 3, 2, 4, 'external_account_2', 'synapse_node_2', 'Account 2', 100, 100, 'depository', 'checking', '002|002', current_timestamp, '002|002', '1111', null, null, 2),
  (3, 3, 2, 4, 'external_account_3', NULL, 'Account 3', 100, 100, 'depository', 'checking', '003|003', current_timestamp, '003|003', '1111', null, null, 3),
  (4, 5, 2, 5, 'external_account_4', 'synapse_node_4', 'Account 4', 100, 100, 'depository', 'checking', '004|004', current_timestamp, '004|004', '1111', null, null, 4),
  (5, 5, 2, 5, 'external_account_5', NULL, 'Account 5', 100, 100, 'depository', 'checking', '005|005', current_timestamp, '005|005', '1111', null, null, 5),
  (6, 5, 2, 6, 'external_account_6', NULL, 'Account 6', 100, 100, 'depository', 'checking', '006|006', current_timestamp, '006|006', '1111', null, null, 6),
  (7, 6, 2, 7, 'external_account_7', NULL, 'Account 7', 100, 100, 'depository', 'checking', '007|007', current_timestamp, '007|007', '1111', null, null, 7),
  (8, 7, 2, 8, 'external_account_8', NULL, 'Account 8', 100, 100, 'depository', 'checking', '008|008', current_timestamp, '008|008', '1111', null, null, 8),
  (9, 9, 2, 9, 'external_account_9', NULL, 'Account 9', 100, 100, 'depository', 'checking', '009|009', current_timestamp, '009|009', '1111', null, null, 9),
  (10, 10, 2, 10, 'external_account_10', NULL, 'Account 10', 100, 100, 'depository', 'checking', '010|010', current_timestamp, '010|010', '1111', null, null, 10),
  (11, 11, 2, 11, 'external_account_11', NULL, 'Account 11', 100, 100, 'depository', 'checking', '011|011', current_timestamp, '011|011', '1111', null, null, 11),
  (12, 12, 2, 12, 'external_account_12', NULL, 'Account 12', 100, 100, 'depository', 'checking', '012|012', current_timestamp, '012|012', '1111', null, null, 12),
  (13, 13, 2, 13, 'external_account_13', NULL, 'Account 13', 100, 100, 'depository', 'checking', '013|013', current_timestamp, '013|013', '1111', null, null, 13),
  (14, 14, 2, 14, 'external_account_14', NULL, 'Account 14', 100, 100, 'depository', 'checking', '014|014', current_timestamp, '014|014', '1111', null, null, 14),
  (22, 22, 2, 22, 'external_account_22', NULL, 'Account 22', 40, 30, 'depository', 'checking', '022|022', current_timestamp, '022|022', '1111', null, null, null),
  (31, 31, 2, 31, 'external_account_31', NULL, 'Account 31', 100, 100, 'depository', 'checking', '031|031', current_timestamp, '031|031', '1111', null, null, null),
  (100, 100, 2, 100, 'external_account_100', NULL, 'Account 100', 100, 100, 'depository', 'checking', '100|100', current_timestamp, '100|100', '1111', null, null, null),
  (101, 100, 2, 100, 'external_account_101', NULL, 'Account 101', 101, 101, 'depository', 'checking', '101|101', current_timestamp, '101|101', '1111', null, null, null),
  (102, 100, 2, 100, 'external_account_102', NULL, 'Account 102', 102, 102, 'depository', 'checking', '102|102', current_timestamp, '102|102', '1111', null, null, null),
  (103, 100, 2, 100, 'external_account_103', NULL, 'Account 103', 103, 103, 'depository', 'checking', '103|103', current_timestamp, '103|103', '1111', null, null, null),
  (104, 100, 2, 100, 'external_account_104', NULL, 'Account 104', 104, 104, 'depository', 'checking', '104|104', current_timestamp, '104|104', '1111', 104, null, null),
  (106, 100, 2, 100, 'external_account_106', NULL, 'Account 106', 106, 106, 'depository', 'checking', '106|106', current_timestamp, '106|106', '1111', null, null, null),
  (107, 100, 3, 101, 'external_account_107', NULL, 'Account 107', 107, 107, 'depository', 'checking', '107|107', current_timestamp, '107|107', '1111', null, null, null),
  (108, 100, 3, 100, 'external_account_108', NULL, 'Account 108', 108, 108, 'depository', 'checking', '108|108', current_timestamp, '108|108', '1111', null, null, null),
  (109, 100, 3, 100, 'external_account_109', NULL, 'Account 109', 109, 109, 'depository', 'checking', '109|109', current_timestamp, '109|109', '1111', null, null, null),
  (110, 100, 3, 100, 'external_account_110', NULL, 'Account 110', 110, 110, 'depository', 'checking', '110|110', current_timestamp, '110|110', '1111', null, null, null),
  (111, 100, 3, 100, 'external_account_111', NULL, 'Account 111', 111, 111, 'depository', 'checking', '111|111', current_timestamp, '111|111', '1111', null, null, null),
  (112, 100, 3, 100, 'external_account_112', NULL, 'Account 112', 112, 112, 'depository', 'checking', '112|112', current_timestamp, '112|112', '1111', null, null, null),
  (113, 100, 3, 100, 'external_account_113', NULL, 'Account 113', 255, 100, 'depository', 'checking', '113|113', current_timestamp, '113|113', '1111', null, null, null),
  (114, 100, 3, 100, 'external_account_114', NULL, 'Account 114', 100, 100, 'depository', 'checking', '114|114', current_timestamp, '114|114', '1111', null, null, null),
  (115, 100, 3, 100, 'external_account_115', NULL, 'Account 115', 100, 100, 'depository', 'checking', '115|115', current_timestamp, '115|115', '1111', 121, null, null),
  (116, 116, 2, 116, 'external_account_116', NULL, 'Account 116', 100, 100, 'depository', 'checking', '116|116', current_timestamp, '116|116', '1111', null, null, null),
  (117, 117, 2, 117, 'external_account_117', NULL, 'Account 117', 100, 100, 'depository', 'checking', '117|117', current_timestamp - INTERVAL 3 DAY, '117|117', '1111', null, null, null),
  (118, 118, 2, 118, 'external_account_118', NULL, 'Account 118', 10,  10,  'depository', 'checking', '118|118', current_timestamp, '118|118', '1111', null, null, null),
  (119, 119, 2, 119, 'external_account_119', NULL, 'Account 119', 100, 100, 'depository', 'checking', '119|119', current_timestamp, '119|119', '1111', null, null, null),
  (120, 120, 2, 120, 'wpwwQpJoezTNy7wmrmQdIZ4ZbkM6ABirm9XA5', NULL, 'Account 120', 100, 100, 'depository', 'checking', '120|120', current_timestamp, '120|120', '1111', null, null, null),
  (121, 121, 2, 121, '9aw4RgDgZzudyqMVdwAlIxL53jwLd8FRg8Nll', NULL, 'Account 121', 100, 100, 'depository', 'checking', '121|121', current_timestamp, '121|121', '1111', null, null, null),
  (122, 122, 2, 122, 'external_account_122', NULL, 'Account 122', 100, 100, 'depository', 'checking', '122|122', current_timestamp, '122|122', '1111', null, null, null),
  (123, 122, 2, 122, 'external_account_123', NULL, 'Account 123', 100, 100, 'depository', 'checking', '123|123', current_timestamp, '123|123', '1111', null, null, null),
  (125, 100, 3, 100, 'external_account_125', NULL, 'Account 125', 100, 100, 'depository', 'checking', '125|125', current_timestamp, '125|125', '1111', null, null, null),
  (126, 100, 3, 100, 'external_account_126', NULL, 'Account 126', 100, 100, 'depository', 'checking', '126|126', current_timestamp, '126|126', '1111', null, null, null),
  (200, 200, 2, 200, 'external_account_200', NULL, 'Account 200', 200, 200, 'depository', 'checking', '200|200', current_timestamp, '200|200', '1111', null, null, 200),
  (201, 200, 2, 200, 'external_account_201', NULL, 'Account 201', 201, 201, 'depository', 'checking', '201|201', current_timestamp, '201|201', '1111', null, null, null),
  (202, 200, 2, 200, 'external_account_202', NULL, 'Account 202', 202, 202, 'depository', 'checking', '202|202', current_timestamp, '202|202', '1111', null, null, null),
  (203, 200, 2, 200, 'external_account_203', NULL, 'Account 202', 202, 202, 'depository', 'checking', '202|202', current_timestamp, '202|202', '1111', null, null, null),
  (300, 300, 2, 300, 'external_account_300', NULL, 'Account 300', 300, 300, 'depository', 'checking', '300|300', current_timestamp, '300|300', '1111', null, null, null),
  (400, 400, 2, 400, 'external_account_400', NULL, 'Account 400', 400, 400, 'depository', 'checking', '400|400', current_timestamp, '400|400', '1111', null, null, null),
  (401, 400, 2, 400, 'external_account_401', NULL, 'Account 401', 401, 401, 'depository', 'checking', '401|401', current_timestamp, '401|401', '1111', null, null, null),
  (402, 400, 2, 400, 'external_account_402', NULL, 'Account 402', 402, 402, 'depository', 'checking', '402|402', current_timestamp, '402|402', '1111', null, null, null),
  (403, 400, 2, 400, 'external_account_403', NULL, 'Account 403', 403, 403, 'depository', 'checking', '403|403', current_timestamp, '403|403', '1111', null, null, null),
  (404, 400, 2, 400, 'external_account_404', NULL, 'Account 404', 404, 404, 'depository', 'checking', '404|404', current_timestamp, '404|404', '1111', null, null, null),
  (405, 400, 2, 400, 'external_account_405', NULL, 'Account 405', 405, 405, 'depository', 'checking', '405|405', current_timestamp, '405|405', '1111', null, null, null),
  (406, 400, 2, 400, 'external_account_406', NULL, 'Account 406', 406, 406, 'depository', 'checking', '406|406', current_timestamp, '406|406', '1111', null, null, null),
  (407, 400, 2, 400, 'external_account_407', NULL, 'Account 407', 407, 407, 'depository', 'checking', '407|407', current_timestamp, '407|407', '1111', null, null, null),
  (408, 400, 2, 400, 'external_account_408', NULL, 'Account 408', 408, 408, 'depository', 'checking', '408|408', current_timestamp, '408|408', '1111', null, null, null),
  (409, 400, 2, 400, 'external_account_409', NULL, 'Account 409', 409, 409, 'depository', 'checking', '409|409', current_timestamp, '409|409', '1111', null, null, null),
  (410, 1, 2, 2, 'external_account_410', NULL, 'Account 410', 100, 100, 'depository', 'checking', NULL, current_timestamp, NULL, '1111', null, null, null),
  (500, 500, 2, 500, 'external_account_500', NULL, 'Account 500', 500, 500, 'depository', 'checking', '500|500', current_timestamp, '500|500', '1111', null, null, 500),
  (700, 700, 2, 700, 'external_account_700', NULL, 'Account 700', 700, 700, 'depository', 'checking', null, current_timestamp, '700|700', '1111', null, null, 700),
  (701, 700, 2, 700, 'external_account_701', NULL, 'Account 701', 701, 701, 'depository', 'checking', null, current_timestamp, '701|701', '1111', null, null, null),
  (702, 700, 2, 700, 'external_account_702', NULL, 'Account 702', 702, 702, 'depository', 'checking', '702|702', current_timestamp, '702|702', '1111', null, null, 702),
  (703, 701, 2, 701, 'external_account_703', NULL, 'Account 703', 703, 703, 'depository', 'checking', '703|703', current_timestamp, '703|703', '1111', null, null, null),
  (704, 701, 2, 702, 'external_account_704', NULL, 'Account 704', 704, 704, 'depository', 'checking', '704|704', current_timestamp, '704|704', '1111', null, null, null),
  (705, 701, 2, 703, 'external_account_705', NULL, 'Account 705', 705, 705, 'depository', 'checking', '705|705', current_timestamp, '705|705', '1111', null, null, null),
  (706, 701, 2, 703, 'external_account_706', NULL, 'Account 706', 706, 706, 'depository', 'checking', '706|706', current_timestamp, '706|706', '1111', null, null, null),
  (707, 701, 2, 703, 'external_account_707', NULL, 'Account 707', 707, 707, 'depository', 'checking', '707|707', current_timestamp, '707|707', '1111', null, null, null),
  (708, 701, 2, 703, 'external_account_708', NULL, 'Account 708', 708, 708, 'depository', 'checking', '708|708', current_timestamp, '708|708', '1111', null, null, null),
  (709, 704, 2, 703, 'external_account_709', NULL, 'Account 709', 709, 709, 'depository', 'checking', '709|709', current_timestamp, '709|709', '1111', 113, null, null),
  (710, 704, 2, 703, 'external_account_710', NULL, 'Account 710', 710, 710, 'depository', 'checking', '710|710', current_timestamp, '710|710', '1111', null, null, null),
  (800, 800, 2, 800, 'external_account_800', NULL, 'Account 800', 800, 800, 'depository', 'checking', '800|800', current_timestamp, '800|800', '1111', null, null, 800),
  (801, 800, 2, 800, 'external_account_801', NULL, 'Account 801', 801, 801, 'depository', 'checking', '801|801', current_timestamp, '801|801', '1111', null, null, null),
  (1100, 1100, 2, 1100, 'external_account_1100', NULL, 'Account 1100', 1100, 1100, 'depository', 'checking', '1100|1100', current_timestamp, '1100|1100', '1111', null, null, null),
  (1200, 1200, 2, 1200, 'external_account_1200', NULL, 'Account 1200', 1200, 1200, 'depository', 'checking', '1200|1200', current_timestamp, '1200|1200', '1111', null, null, null),
  (1300, 1300, 2, 1300, 'external_account_1300', NULL, 'Account 1300', 1300, 1300, 'depository', 'checking', '1300|1300', current_timestamp, '1300|1300', '1111', null, null, 1300),
  (1400, 1400, 2, 1400, 'external_account_1400', NULL, 'Account 1400', 1400, 1400, 'depository', 'checking', '1400|1400', current_timestamp, '1400|1400', '1111', null, null, 1400),
  (1600, 1600, 2, 1600, 'external_account_1600', NULL, 'Account 1600', 1600, 1600, 'depository', 'checking', '1600|1600', current_timestamp, '1600|1600', '1111', null, '2018-03-20 10:30:58', 1600),
  (1700, 1700, 2, 1700, 'external_account_1700', NULL, 'Account 1700', 1700, 1700, 'depository', 'checking', '1700|1700', current_timestamp, '1700|1700', '1111', null, null, 1700),
  (1800, 1800, 2, 1800, 'external_account_1800', NULL, 'Account 1800', 1800, 1800, 'depository', 'checking', '1800|1800', current_timestamp, '1800|1800', '1111', null, null, 1800),
  (2000, 2000, 2, 2000, 'external_account_2000', NULL, 'Account 2000', 2000, 2000, 'depository', 'checking', '2000|2000', current_timestamp, '2000|2000', '1111', null, null, 2000),
  (2001, 2000, 2, 2000, 'external_account_2001', NULL, 'Account 2001', 2001, 2001, 'depository', 'checking', '2001|2001', current_timestamp, '2001|2001', '1111', null, null, 2001),
  (2200, 2200, 2, 2200, 'external_account_2200', NULL, 'Account 2200', 2200, 2200, 'depository', 'checking', '2200|2200', current_timestamp, '2200|2200', '1111', null, null, null),
  (2300, 2300, 2, 2300, 'external_account_2300', NULL, 'Account 2300', 2300, 2300, 'depository', 'checking', '2300|2300', current_timestamp, '2300|2300', '1111', null, null, null),
  (2400, 2400, 2, 2400, 'external_account_2400', NULL, 'Account 2400', 2400, 2400, 'depository', 'checking', '2400|2400', current_timestamp, '2400|2400', '1111', null, null, 2400),
  (2600, 2600, 2, 2600, 'external_account_2600', NULL, 'Account 2600', 2600, 2600, 'depository', 'checking', '2600|2600', current_timestamp, '2600|2600', '1111', null, null, null);
  INSERT into bank_account
  (id, user_id, institution_id, bank_connection_id, external_id, synapse_node_id, display_name, current, available, type, subtype, account_number, updated, account_number_aes256, last_four, main_paycheck_recurring_transaction_id, deleted, micro_deposit_created, micro_deposit)
  VALUES
  (1201, 1200, 2, 1200, 'external_account_1201', NULL, 'Account 1201', 1201, 1201, 'depository', 'checking', '1201|1201', current_timestamp, '1201|1201', '1111', null, null, '${moment()
    .subtract(2, 'day')
    .format('YYYY-MM-DD HH:mm:ss')}', 'REQUIRED'),
  (1202, 1200, 2, 1200, 'external_account_1202', NULL, 'Account 1202', 1202, 1202, 'depository', 'checking', '12345678|021000021', current_timestamp, '12345678|021000021', '1111', null,  null, null, null),
  (1203, 1200, 2, 1200, 'external_account_1203', NULL, 'Account 1203', 1203, 1203, 'depository', 'checking', '12345678|021000021', current_timestamp, '12345678|021000021', '1111', null, '2018-03-20 10:30:58', '${moment()
    .subtract(2, 'day')
    .format('YYYY-MM-DD HH:mm:ss')}', 'COMPLETED');
`;

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

const tableName = 'bank_account';

export default { up, tableName, upSql };
