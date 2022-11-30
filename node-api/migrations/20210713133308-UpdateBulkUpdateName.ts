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
    UPDATE dashboard_bulk_update
    SET name = substring_index(input_file_url, '/', -1)
    WHERE name is null;`);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('UPDATE dashboard_bulk_update SET name = null where name is not null;');
}

export const _meta = {
  version: 1,
};
