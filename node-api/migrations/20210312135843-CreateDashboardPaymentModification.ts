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
    CREATE TABLE dashboard_payment_modification (
      id int(11) NOT NULL AUTO_INCREMENT,
      payment_id int(11) NOT NULL,
      dashboard_action_log_id int(11) NOT NULL,
      modification JSON DEFAULT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT dashboard_payment_modification_payment_id FOREIGN KEY (payment_id) REFERENCES payment (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT dashboard_payment_modification_dashboard_action_log_id FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    DROP TABLE IF EXISTS dashboard_payment_modification;
  `);
}

export const _meta = {
  version: 1,
};
