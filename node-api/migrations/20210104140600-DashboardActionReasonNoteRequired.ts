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
    ALTER TABLE dashboard_action_reason
      ADD COLUMN note_required TINYINT(1) NOT NULL DEFAULT '0';
  `);

  await db.runSql(`
    UPDATE dashboard_action_reason
      SET note_required='1'
      WHERE reason='Other';
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE dashboard_action_reason
      DROP COLUMN note_required;
  `);
}

export const _meta = {
  version: 1,
};
