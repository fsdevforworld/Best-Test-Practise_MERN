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
  await db.runSql(
    `ALTER TABLE advance_approval ADD COLUMN ext_recurring_transaction_uuid char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE advance_approval ADD COLUMN ext_expected_transaction_uuid char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE bank_account ADD COLUMN ext_main_paycheck_recurring_transaction_uuid char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );

  await db.runSql(
    `ALTER TABLE bank_account ADD KEY bank_account_ext_main_paycheck_recurring_transaction_uuid_fk (ext_main_paycheck_recurring_transaction_uuid);`,
  );
  await db.runSql(
    `ALTER TABLE advance_approval ADD KEY advance_approval_ext_expected_transaction_uuid_fk (ext_expected_transaction_uuid);`,
  );
  await db.runSql(
    `ALTER TABLE advance_approval ADD KEY advance_approval_ext_recurring_transaction_uuid_fk (ext_recurring_transaction_uuid);`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `ALTER TABLE advance_approval DROP KEY advance_approval_ext_expected_transaction_uuid_fk;`,
  );
  await db.runSql(
    `ALTER TABLE advance_approval DROP KEY advance_approval_ext_recurring_transaction_uuid_fk;`,
  );
  await db.runSql(
    `ALTER TABLE bank_account DROP KEY bank_account_ext_main_paycheck_recurring_transaction_uuid_fk;`,
  );

  await db.runSql(`ALTER TABLE advance_approval DROP COLUMN ext_recurring_transaction_uuid;`);
  await db.runSql(`ALTER TABLE advance_approval DROP COLUMN ext_expected_transaction_uuid;`);
  await db.runSql(
    `ALTER TABLE bank_account DROP COLUMN ext_main_paycheck_recurring_transaction_uuid;`,
  );
}

export const _meta = {
  version: 1,
};
