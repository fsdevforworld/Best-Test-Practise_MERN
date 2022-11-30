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
    CREATE TABLE dashboard_note_priority (
      code varchar(256) NOT NULL PRIMARY KEY,
      ranking int(11) NOT NULL UNIQUE,
      display_name varchar(256) NOT NULL UNIQUE,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
    );
  `);

  await db.runSql(`
    CREATE TABLE dashboard_user_note (
      id int(11) NOT NULL AUTO_INCREMENT,
      user_id int(11) NOT NULL,
      dashboard_action_log_id int(11) NOT NULL,
      dashboard_note_priority_code varchar(256) NOT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
      deleted datetime DEFAULT NULL,
      PRIMARY KEY (id),
      CONSTRAINT dashboard_user_note_user_id FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT dashboard_user_note_dashboard_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT dashboard_user_note_dashboard_note_priority_code FOREIGN KEY (dashboard_note_priority_code) REFERENCES dashboard_note_priority (code) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    DROP TABLE IF EXISTS dashboard_user_note;
  `);

  await db.runSql(`
    DROP TABLE IF EXISTS dashboard_note_priority;
  `);
}

export const _meta = {
  version: 1,
};
