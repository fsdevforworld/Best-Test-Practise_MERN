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
    CREATE TABLE dashboard_recurring_goals_transfer_modification (
      id int(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
      recurring_goals_transfer_id varchar(256) NOT NULL,
      dashboard_action_log_id int(11) NOT NULL,
      modification JSON DEFAULT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (recurring_goals_transfer_id),
      CONSTRAINT dashboard_recurring_goals_transfer_dashboard_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    DROP TABLE IF EXISTS dashboard_recurring_goals_transfer_modification;
  `);
}

export const _meta = {
  version: 1,
};
