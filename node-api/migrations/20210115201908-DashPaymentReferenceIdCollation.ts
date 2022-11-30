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
    ALTER TABLE dashboard_payment
    MODIFY payment_reference_id varchar(16) COLLATE utf8mb4_unicode_ci
    GENERATED ALWAYS AS (left(tivan_reference_id, 16))
    VIRTUAL;
  `);

  await db.runSql(`
    ALTER TABLE dashboard_advance_repayment
    ADD (
      amount decimal(16,2) DEFAULT NULL,
      payment_method_universal_id varchar(256) DEFAULT NULL
    ),
    DROP FOREIGN KEY dash_advance_repayment_action_log_id_fk,
    DROP PRIMARY KEY;
  `);

  await db.runSql(`
    ALTER TABLE dashboard_advance_repayment
    MODIFY tivan_task_id varchar(256) UNIQUE NOT NULL PRIMARY KEY;
  `);

  await db.runSql(`
    ALTER TABLE dashboard_advance_repayment
    ADD CONSTRAINT dash_advance_repayment_action_log_id_fk FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id);
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE dashboard_payment
    MODIFY payment_reference_id varchar(16)
    GENERATED ALWAYS AS (left(tivan_reference_id, 16))
    VIRTUAL;
  `);

  await db.runSql(`
    ALTER TABLE dashboard_advance_repayment
    DROP amount,
    DROP payment_method_universal_id,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY(dashboard_action_log_id),
    MODIFY tivan_task_id varchar(256) UNIQUE;
  `);
}

export const _meta = {
  version: 1,
};
