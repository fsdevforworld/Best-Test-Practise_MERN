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
  await db.runSql(
    `ALTER TABLE admin_paycheck_override
    ADD CONSTRAINT admin_paycheck_override_creator_id_fk FOREIGN KEY (creator_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `ALTER TABLE admin_paycheck_override
    DROP FOREIGN KEY admin_paycheck_override_creator_id_fk,
    `,
  );
}

export const _meta = {
  version: 1,
};
