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
    CREATE TABLE dashboard_action_log_monthly_statement (
      dashboard_action_log_id int(11) NOT NULL,
      statement_id varchar(255) NOT NULL,
      PRIMARY KEY (dashboard_action_log_id, statement_id),
      CONSTRAINT action_log_monthly_statement_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    DROP TABLE IF EXISTS dashboard_action_log_monthly_statement;
  `);
}

export const _meta = {
  version: 1,
};
