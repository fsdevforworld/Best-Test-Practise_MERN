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
    `INSERT INTO deep_link (url, path, min_version) VALUES ("job-pack", "Authorized/Account/JobPack", "2.22.0");`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `DELETE FROM deep_link WHERE url = "job-pack" AND path = "Authorized/Account/JobPack";`,
  );
}

export const _meta = {
  version: 1,
};
