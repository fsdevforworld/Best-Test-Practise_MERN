import { sequelize } from '../../src/models';
import { noKeyChecks } from './helper';
import * as Bluebird from 'bluebird';

const upSql = `
  INSERT into bank_connection
  (id, user_id, institution_id, external_id, auth_token, has_valid_credentials, created, deleted, initial_pull)
  VALUES
  (1, 1, 1, 'external_1', 'token_1', true, NOW() - INTERVAL 10 MINUTE, null, null),
  (2, 2, 2, 'external_2', 'token_2', true, NOW(), null, NOW()),
  (3, 1, 2, 'external_3', 'token_3', true, NOW(), null, NOW()),
  (4, 3, 2, 'external_connection_4', 'token_4', true, NOW(), null, NOW()),
  (5, 5, 2, 'external_connection_5', 'token_5', true, NOW(), null, NOW()),
  (6, 5, 2, 'external_connection_6', 'token_6', false, NOW(), null, NOW()),
  (7, 6, 2, 'external_connection_7', 'token_7', true, NOW(), null, NOW()),
  (8, 7, 2, 'external_connection_8', 'token_8', true, NOW(), null, NOW()),
  (9, 9, 2, 'external_connection_9', 'token_9', true, NOW(), null, NOW()),
  (10, 10, 2, 'external_connection_10', 'token_10', true, NOW(), null, NOW()),
  (11, 11, 2, 'external_connection_11', 'token_11', true, NOW(), null, NOW()),
  (12, 12, 2, 'external_connection_12', 'token_12', true, NOW(), null, NOW()),
  (13, 13, 2, 'external_connection_13', 'token_13', true, NOW(), null, NOW()),
  (14, 14, 2, 'external_connection_14', 'token_14', true, NOW(), null, NOW()),
  (22, 22, 2, 'external_connection_22', 'token_22', true, NOW(), null, NOW()),
  (31, 31, 2, 'external_connection_31', 'token_31', true, NOW(), null, NOW()),
  (32, 32, 2, 'external_connection_32', 'token_32', true, NOW(), null, NOW()),
  (33, 9,  2, 'external_connection_33', 'token_33', true, NOW(), null, NOW()),
  (34, 10, 2, 'external_connection_34', 'token_34', true, NOW(), null, NOW()),
  (35, 11, 2, 'external_connection_35', 'token_35', true, NOW(), null, NOW()),
  (100, 100, 2, 'external_connection_100', 'token_100', true, NOW(), null, NOW()),
  (101, 100, 3, 'external_connection_101', 'token_101', true, NOW(), null, NOW()),
  (116, 116, 2, 'external_connection_116', 'token_116', false, NOW(), null, NOW()),
  (117, 117, 2, 'external_connection_117', 'token_117', true, NOW(), null, NOW()),
  (118, 118, 2, 'external_connection_118', 'token_118', true, NOW(), null, NOW()),
  (119, 119, 2, 'external_connection_119', 'token_119', true, NOW(), null, NOW()),
  (120, 120, 2, 'XM66KMB9DNTy7BRnpnm6CQ8QM8oKNLhVVWKMve', 'access-sandbox-d6ee1fa2-6a42-43a1-a6e3-0d63329859b0', true, NOW(), null, NOW()),
  (121, 121, 2, 'eGJ7M838zpTwvoRzwaPWF4m7V46AJet8krrLdj', 'access-sandbox-965c84e2-1574-4c73-93c0-36d9e6017af7', true, NOW(), null, NOW()),
  (122, 122, 2, 'external_connection_122', 'token_122', true, NOW(), null, NOW()),
  (200, 200, 2, 'external_connection_200', 'token_200', true, NOW(), null, NOW()),
  (300, 300, 2, 'external_connection_300', 'token_300', true, NOW(), null, NOW()),
  (400, 400, 2, 'external_connection_400', 'token_400', true, NOW(), null, NOW()),
  (500, 500, 2, 'external_connection_500', 'token_500', true, NOW(), null, NOW()),
  (700, 700, 2, 'external_connection_700', 'token_700', true, NOW(), null, NOW()),
  (701, 701, 2, 'external_connection_701', 'token_701', true, NOW(), null, NOW()),
  (702, 701, 2, 'external_connection_702', 'token_702', true, NOW(), null, NOW()),
  (703, 701, 2, 'external_connection_703', 'token_703', true, NOW(), null, NOW()),
  (704, 701, 2, 'external_connection_704', 'token_704', true, NOW(), null, NOW()),
  (705, 701, 2, 'external_connection_705', 'token_705', true, NOW(), null, NOW()),
  (800, 800, 2, 'external_connection_800', 'token_800', true, NOW(), null, NOW()),
  (1100, 1100, 2, 'external_connection_1100', 'token_1100', true, NOW(), null, NOW()),
  (1200, 1200, 2, 'external_connection_1200', 'token_1200', true, NOW(), null, NOW()),
  (1300, 1300, 2, 'external_connection_1300', 'token_1300', true, NOW(), null, NOW()),
  (1400, 1400, 2, 'external_connection_1400', 'token_1400', true, NOW(), null, NOW()),

  (1600, 1600, 2, 'external_connection_1600', 'token1600', true, NOW(), '2018-03-20 10:30:58', NOW()),
  (1700, 1700, 2, 'external_connection_1700', 'token1700', true, NOW(), null, NOW()),

  (2000, 2000, 2, 'external_connection_2000', 'token2000', true, NOW(), null, NOW()),
  (2200, 2200, 2, 'external_connection_2200', 'token2200', true, NOW(), null, NOW()),
  (2300, 2300, 2, 'external_connection_2300', 'token2300', true, NOW(), null, NOW()),
  (2400, 2400, 2, 'external_connection_2400', 'token2400', true, NOW(), null, NOW()),
  (2500, 2500, 2, 'external_connection_2500', 'token2500', true, NOW(), null, NOW()),
  (2600, 2600, 2, 'external_connection_2600', 'token2600', true, NOW(), null, NOW());
`;

function up(): Bluebird<any> {
  return sequelize.query(noKeyChecks(upSql));
}

const tableName = 'bank_connection';

export default { up, upSql, tableName };
