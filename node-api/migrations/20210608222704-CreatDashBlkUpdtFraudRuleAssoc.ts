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
  CREATE TABLE dashboard_bulk_update_fraud_rule (
    dashboard_bulk_update_id int(11) NOT NULL,
    fraud_rule_id int(11) NOT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (dashboard_bulk_update_id, fraud_rule_id),
    CONSTRAINT bulk_update_fk FOREIGN KEY (dashboard_bulk_update_id) REFERENCES dashboard_bulk_update (id),
    CONSTRAINT fraud_rule_fk FOREIGN KEY (fraud_rule_id) REFERENCES fraud_rule (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS dashboard_bulk_update_fraud_rule;');
}

export const _meta = {
  version: 1,
};
