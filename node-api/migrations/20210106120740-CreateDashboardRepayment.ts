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
    CREATE TABLE dashboard_advance_repayment (
      dashboard_action_log_id int(11) NOT NULL PRIMARY KEY,
      tivan_task_id varchar(256) UNIQUE,
      advance_id int(11) NOT NULL,
      status enum('PENDING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime default CURRENT_TIMESTAMP NULL on update CURRENT_TIMESTAMP,
      CONSTRAINT dash_advance_repayment_action_log_id_fk FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id),
      CONSTRAINT dash_advance_repayment_advance_id_fk FOREIGN KEY (advance_id) REFERENCES advance (id),
      INDEX dash_advance_repayment_status_idx (status)
    );
  `);

  await db.runSql(`
    CREATE TABLE dashboard_payment (
      tivan_task_id varchar(256) NOT NULL,
      tivan_reference_id varchar(256) NOT NULL,
      payment_reference_id varchar(16) GENERATED ALWAYS AS (left(tivan_reference_id, 16)) VIRTUAL,
      PRIMARY KEY (tivan_reference_id, tivan_task_id),
      INDEX dash_payment_payment_reference_id_idx (payment_reference_id),
      CONSTRAINT dash_payment_tivan_task_id_fk FOREIGN KEY (tivan_task_id) REFERENCES dashboard_advance_repayment (tivan_task_id)
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS dashboard_payment');
  await db.runSql('DROP TABLE IF EXISTS dashboard_advance_repayment');
}

export const _meta = {
  version: 1,
};
