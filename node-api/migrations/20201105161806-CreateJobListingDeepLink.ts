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
  await db.runSql(
    `INSERT INTO deep_link (url, path, min_version) VALUES ("side-hustle-job", "Authorized/Account/JobListing", "2.23.0");`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `DELETE FROM deep_link WHERE url = "side-hustle-job" AND path = "Authorized/Account/JobListing";`,
  );
}

export const _meta = {
  version: 1,
};
