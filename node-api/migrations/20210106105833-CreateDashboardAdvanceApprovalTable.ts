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
    CREATE TABLE dashboard_advance_approval (
      advance_approval_id int(11) NOT NULL,
      dashboard_action_log_id int(11) NOT NULL,
      PRIMARY KEY (advance_approval_id, dashboard_action_log_id),
      CONSTRAINT dashboard_advance_approval_advance_approval_fk FOREIGN KEY (advance_approval_id) REFERENCES advance_approval (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT dashboard_advance_approval_dashboard_action_log_fk FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS dashboard_advance_approval;');
}

export const _meta = {
  version: 1,
};
