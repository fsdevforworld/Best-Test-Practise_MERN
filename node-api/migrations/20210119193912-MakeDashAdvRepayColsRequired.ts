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
    ALTER TABLE dashboard_advance_repayment
    MODIFY amount decimal(16,2) NOT NULL,
    MODIFY payment_method_universal_id varchar(256) NOT NULL;
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    ALTER TABLE dashboard_advance_repayment
    MODIFY amount decimal(16,2) DEFAULT NULL,
    MODIFY payment_method_universal_id varchar(256) DEFAULT NULL;
  `);
}

export const _meta = {
  version: 1,
};
