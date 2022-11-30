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
    ALTER TABLE payment_reversal ADD COLUMN dashboard_action_log_id int(11);
  `);

  await db.runSql(`
    ALTER TABLE payment_reversal
    ADD CONSTRAINT payment_reversal_dashboard_action_log_fk
      FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE payment_reversal DROP FOREIGN KEY payment_reversal_dashboard_action_log_fk;
  `);

  await db.runSql(`
    ALTER TABLE payment_reversal DROP COLUMN dashboard_action_log_id;
  `);
}

export const _meta = {
  version: 1,
};
