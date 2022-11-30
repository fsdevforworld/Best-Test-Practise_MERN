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
    ALTER TABLE delete_request DROP FOREIGN KEY delete_request_initiator_id_foreign;
  `);

  await db.runSql(`
    ALTER TABLE delete_request
      ADD CONSTRAINT delete_request_initiator_id_fk
      FOREIGN KEY (initiator_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE delete_request DROP FOREIGN KEY IF EXISTS delete_request_initiator_id_fk;
  `);

  await db.runSql(`
    ALTER TABLE delete_request
      ADD CONSTRAINT IF NOT EXISTS delete_request_initiator_id_foreign
      FOREIGN KEY (initiator_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export const _meta = {
  version: 1,
};
