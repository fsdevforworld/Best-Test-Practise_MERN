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
    `ALTER TABLE side_hustle_jobs
      ADD (
        posted_date datetime DEFAULT NULL
      );`,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(
    `ALTER TABLE side_hustle_jobs
      DROP posted_date;`,
  );
}

export const _meta = {
  version: 1,
};
