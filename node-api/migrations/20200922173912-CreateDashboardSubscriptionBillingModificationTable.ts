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
    CREATE TABLE dashboard_subscription_billing_modification (
      id int(11) NOT NULL AUTO_INCREMENT,
      subscription_billing_id int(11) NOT NULL,
      dashboard_action_log_id int(11) NOT NULL,
      modification JSON NOT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT dashboard_sub_bill_modification_subscription_billing_id
        FOREIGN KEY (subscription_billing_id) REFERENCES subscription_billing (id)
        ON DELETE NO ACTION ON UPDATE NO ACTION,
      CONSTRAINT dashboard_sub_bill_modification_dashboard_action_log_id
        FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
    );
  `);

  await db.runSql(`
      ALTER TABLE dashboard_advance_modification MODIFY modification JSON NOT NULL;
  `);

  await db.runSql(`
      ALTER TABLE dashboard_user_modification MODIFY modification JSON NOT NULL;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    DROP TABLE IF EXISTS dashboard_subscription_billing_modification;
  `);

  await db.runSql(`
      ALTER TABLE dashboard_advance_modification MODIFY modification JSON DEFAULT NULL;
  `);

  await db.runSql(`
      ALTER TABLE dashboard_user_modification MODIFY modification JSON DEFAULT NULL;
  `);
}

export const _meta = {
  version: 1,
};
