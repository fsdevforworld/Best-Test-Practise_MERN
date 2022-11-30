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
    ALTER TABLE dashboard_action
    ADD UNIQUE KEY idx_unique_code (code);
  `);

  await db.runSql(`
    ALTER TABLE dashboard_action
    ALTER code DROP DEFAULT;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE dashboard_action
    DROP KEY idx_unique_code;
  `);

  await db.runSql(`
    ALTER TABLE dashboard_action
    ALTER code SET DEFAULT '';
  `);
}

export const _meta = {
  version: 1,
};
