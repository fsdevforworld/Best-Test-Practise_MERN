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
    CREATE TABLE dashboard_action_log_bank_connection (
      dashboard_action_log_id int(11) NOT NULL,
      bank_connection_id int(11) NOT NULL,
      PRIMARY KEY (bank_connection_id, dashboard_action_log_id),
      CONSTRAINT FOREIGN KEY (bank_connection_id) REFERENCES bank_connection (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id)
    )
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS dashboard_action_log_bank_connection');
}

export const _meta = {
  version: 1,
};
