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
    ALTER TABLE membership_pause
      DROP FOREIGN KEY membership_pause_pauser_id_foreign,
      DROP FOREIGN KEY membership_pause_unpauser_id_foreign;
  `);

  await db.runSql(`
    ALTER TABLE membership_pause
      ADD CONSTRAINT membership_pause_pauser_id_fk
      FOREIGN KEY (pauser_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      ADD CONSTRAINT membership_pause_unpauser_id_fk
      FOREIGN KEY (unpauser_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE membership_pause
      DROP FOREIGN KEY membership_pause_pauser_id_fk,
      DROP FOREIGN KEY membership_pause_unpauser_id_fk;
  `);

  await db.runSql(`
    ALTER TABLE membership_pause
      ADD CONSTRAINT membership_pause_pauser_id_foreign
      FOREIGN KEY (pauser_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      ADD CONSTRAINT membership_pause_unpauser_id_foreign
      FOREIGN KEY (unpauser_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export const _meta = {
  version: 1,
};
