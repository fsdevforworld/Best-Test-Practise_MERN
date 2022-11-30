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
    ALTER TABLE dashboard_action
    ADD code VARCHAR(255) NOT NULL DEFAULT '' COLLATE utf8mb4_unicode_ci AFTER id;
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
  ALTER TABLE dashboard_action
  DROP code;
  `);
}

export const _meta = {
  version: 1,
};
