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
  ALTER TABLE user
  ADD COLUMN user_ulid CHAR(26) DEFAULT NULL AFTER legacy_id,
  ADD UNIQUE KEY unique_user_ulid (user_ulid);
`);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('ALTER TABLE user DROP COLUMN user_ulid;');
}

export const _meta = {
  version: 1,
};
