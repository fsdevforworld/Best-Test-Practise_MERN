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
  return await db.runSql(
    `INSERT INTO deep_link (url, path, min_version) VALUES
      ("goals", "Authorized/Goals", "2.44.0")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  return await db.runSql(
    `DELETE FROM deep_link WHERE url = "goals" AND path = "Authorized/Goals";`,
  );
}

export const _meta = {
  version: 1,
};
