import { DBItem, DBType } from 'db-migrate';

export let dbm: any;
export let type: DBType;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
export function setup(options: any): void {
  dbm = options.dbmigrate;
  type = dbm.dataType;
}

export async function up(db: DBItem) {
  return db.runSql(`
    ALTER TABLE fraud_rule
      ADD COLUMN lower_email varchar(256) GENERATED ALWAYS AS (lower(email)) VIRTUAL,
      ADD COLUMN lower_last_name varchar(256) GENERATED ALWAYS AS (lower(last_name)) VIRTUAL,
      ADD COLUMN lower_first_name varchar(256) GENERATED ALWAYS AS (lower(first_name)) VIRTUAL,
      ADD COLUMN lower_address_line_1 varchar(256) GENERATED ALWAYS AS (lower(address_line_1)) VIRTUAL,
      ADD INDEX fraud_rule_is_active_idx (is_active),
      ADD INDEX fraud_rule_lower_email_idx (lower_email),
      ADD INDEX fraud_rule_lower_last_name_lower_first_name_idx (lower_last_name, lower_first_name),
      ADD INDEX fraud_rule_phone_number_idx (phone_number),
      ADD INDEX fraud_rule_lower_address_line_1_zip_code_idx (lower_address_line_1, zip_code);
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    ALTER TABLE fraud_rule
      DROP COLUMN lower_email,
      DROP COLUMN lower_last_name,
      DROP COLUMN lower_first_name,
      DROP COLUMN lower_address_line_1,
      DROP INDEX fraud_rule_is_active_idx,
      DROP INDEX fraud_rule_lower_email_idx,
      DROP INDEX fraud_rule_lower_last_name_lower_first_name_idx,
      DROP INDEX fraud_rule_phone_number_idx,
      DROP INDEX fraud_rule_lower_address_line_1_zip_code_idx;
  `);
}

export const _meta = {
  version: 1,
};
