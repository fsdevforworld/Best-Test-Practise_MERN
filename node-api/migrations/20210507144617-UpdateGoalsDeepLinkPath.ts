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
    UPDATE deep_link
    SET path = 'Authorized/GoalsEntryScreen'
    WHERE url = 'goals' AND path = 'Authorized/Goals';
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    UPDATE deep_link
    SET path = 'Authorized/Goals'
    WHERE url = 'goals' AND path = 'Authorized/GoalsEntryScreen';
  `);
}

export const _meta = {
  version: 1,
};
