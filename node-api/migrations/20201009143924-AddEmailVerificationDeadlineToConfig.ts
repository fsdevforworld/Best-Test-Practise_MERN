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
    'INSERT INTO config (`key`, `value`) VALUES (\'EMAIL_VERIFICATION_DEADLINE\', \'{"date": "2020-12-01"}\')',
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DELETE FROM config WHERE `key` = "EMAIL_VERIFICATION_DEADLINE"');
}

export const _meta = {
  version: 1,
};
