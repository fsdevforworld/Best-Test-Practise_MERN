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
  await db.runSql(`
    CREATE TABLE dashboard_action_log_membership_pause (
      dashboard_action_log_id int(11) NOT NULL,
      membership_pause_id int(11) NOT NULL,
      PRIMARY KEY (dashboard_action_log_id, membership_pause_id),
      CONSTRAINT membership_pause_action_log_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT membership_pause_action_log_membership_pause_id FOREIGN KEY (membership_pause_id) REFERENCES membership_pause (id) ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await db.runSql(`
    CREATE TABLE dashboard_action_log_delete_request (
      dashboard_action_log_id int(11) NOT NULL,
      delete_request_id int(11) NOT NULL,
      PRIMARY KEY (dashboard_action_log_id, delete_request_id),
      CONSTRAINT delete_request_action_log_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT delete_request_action_log_delete_request_id FOREIGN KEY (delete_request_id) REFERENCES delete_request (id) ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS dashboard_action_log_membership_pause;');
  await db.runSql('DROP TABLE IF EXISTS dashboard_action_log_delete_request;');
}

export const _meta = {
  version: 1,
};
