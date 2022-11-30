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
    CREATE TABLE IF NOT EXISTS mobilepay_id (
      id int(11) NOT NULL AUTO_INCREMENT,
      user_id int(11) NOT NULL,
      mobilepay_unique_id char(44) NOT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT mobilepay_id_user_id FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      INDEX mobilepay_unique_id_user_id_idx (mobilepay_unique_id, user_id)
    )
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS mobilepay_id');
}

export const _meta = {
  version: 1,
};
