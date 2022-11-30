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
  return db.runSql(
    `ALTER TABLE advance
      ADD (
          approval_code VARCHAR(255),
          network VARCHAR(255),
          network_id VARCHAR(255)
      );`,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(
    `ALTER TABLE advance
      DROP network_id,
      DROP network,
      DROP approval_code;`,
  );
}

export const _meta = {
  version: 1,
};
