import { DBItem, DBType } from 'db-migrate';
import { SettingId } from '../src/typings';
import logger from '../src/lib/logger';

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
  try {
    await db.runSql('INSERT INTO user_setting_name (id, name) VALUES (?, ?)', [
      SettingId.timezone,
      'timezone',
    ]);
  } catch {
    logger.info('User setting name: timezone, already inserted');
  }
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DELETE FROM user_setting_name WHERE id = ?', [SettingId.timezone]);
}

export const _meta = {
  version: 1,
};
