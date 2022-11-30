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
    ALTER TABLE dashboard_bulk_update ADD COLUMN name varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    ALTER TABLE dashboard_bulk_update DROP COLUMN name;
  `);
}

export const _meta = {
  version: 1,
};
