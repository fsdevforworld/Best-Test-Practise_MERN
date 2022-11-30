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
  await db.runSql(`
    ALTER TABLE reimbursement MODIFY reason TEXT COLLATE utf8mb4_unicode_ci;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE reimbursement MODIFY reason TEXT COLLATE utf8mb4_unicode_ci NOT NULL;
  `);
}

export const _meta = {
  version: 1,
};
