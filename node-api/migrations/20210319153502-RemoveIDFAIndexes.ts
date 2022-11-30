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
  await db.runSql('ALTER TABLE campaign_info\
    DROP INDEX campaign_info_idfa_idx');
  return db.runSql('ALTER TABLE user_session\
  DROP INDEX user_session_idfa_idx');
}

export async function down(db: DBItem): Promise<void> {
  // I don't think we need a down. If it fails for whatever reason, we don't need to roll back information
}

export const _meta = {
  version: 1,
};
