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
  UPDATE side_hustle_category
  SET image = REPLACE(image, 'storage.cloud.google.com', 'storage.googleapis.com')`);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
  UPDATE side_hustle_category
  SET image = REPLACE(image, 'storage.googleapis.com', 'storage.cloud.google.com')`);
}

export const _meta = {
  version: 1,
};
