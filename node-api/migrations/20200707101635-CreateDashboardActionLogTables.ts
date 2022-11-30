import { DBItem, DBType } from 'db-migrate';
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
    await db.runSql(`
      CREATE TABLE dashboard_action (
        id int(11) NOT NULL AUTO_INCREMENT,
        name varchar(255) NOT NULL COLLATE utf8mb4_unicode_ci,
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_unique_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.runSql(`
      CREATE TABLE dashboard_action_reason (
        id int(11) NOT NULL AUTO_INCREMENT,
        dashboard_action_id int(11) NOT NULL,
        reason varchar(255) NOT NULL,
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_unique_reason_and_dashboard_action_id (reason, dashboard_action_id),
        CONSTRAINT dashboard_action_reason_dashboard_action_id_fk FOREIGN KEY (dashboard_action_id) REFERENCES dashboard_action (id) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.runSql(`
      CREATE TABLE dashboard_action_log (
        id int(11) NOT NULL AUTO_INCREMENT,
        dashboard_action_reason_id int(11) NOT NULL,
        internal_user_id int(11) NOT NULL,
        note text DEFAULT NULL,
        zendesk_ticket_url varchar(255) DEFAULT NULL,
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT dashboard_action_log_dashboard_action_reason_id_fk FOREIGN KEY (dashboard_action_reason_id) REFERENCES dashboard_action_reason (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT dashboard_action_log_internal_user_id_fk FOREIGN KEY (internal_user_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.runSql(`
      CREATE TABLE dashboard_advance_modification (
        id int(11) NOT NULL AUTO_INCREMENT,
        advance_id int(11) NOT NULL,
        dashboard_action_log_id int(11) NOT NULL,
        modification JSON DEFAULT NULL,
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        CONSTRAINT dashboard_advance_modification_advance_id FOREIGN KEY (advance_id) REFERENCES advance (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT dashboard_advance_modification_dashboard_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
  } catch (ex) {
    logger.warn(ex);
    down(db);
  }
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS dashboard_advance_modification');
  await db.runSql('DROP TABLE IF EXISTS dashboard_action_log');
  await db.runSql('DROP TABLE IF EXISTS dashboard_action_reason');
  await db.runSql('DROP TABLE IF EXISTS dashboard_action');
}

export const _meta = {
  version: 1,
};
