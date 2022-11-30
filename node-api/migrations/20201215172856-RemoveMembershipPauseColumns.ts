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
    ALTER TABLE membership_pause
      DROP FOREIGN KEY membership_pause_pauser_id_fk,
      DROP FOREIGN KEY membership_pause_unpauser_id_fk,
      DROP COLUMN pauser_id,
      DROP COLUMN unpauser_id,
      DROP COLUMN extra;
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`
    ALTER TABLE membership_pause
      ADD COLUMN pauser_id int(11),
      ADD COLUMN unpauser_id int(11),
      ADD COLUMN extra json,
      ADD CONSTRAINT membership_pause_pauser_id_fk
        FOREIGN KEY (pauser_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      ADD CONSTRAINT membership_pause_unpauser_id_fk
        FOREIGN KEY (unpauser_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
  `);
}

export const _meta = {
  version: 1,
};
