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
    ALTER TABLE synapsepay_document
      ADD COLUMN id_score decimal(3,2),
      ADD INDEX id_score_idx (id_score);
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    ALTER TABLE synapsepay_document
      DROP INDEX id_score_idx,
      DROP COLUMN id_score;
  `);
}

export const _meta = {
  version: 1,
};
