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
  CREATE TABLE user_address (
      id int(11) NOT NULL AUTO_INCREMENT,
      user_id int(11) NOT NULL,
      address_line1 varchar(256),
      address_line2 varchar(256),
      city varchar(256),
      state varchar(6),
      zip_code varchar(12),
      PRIMARY KEY (id),
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT user_address_user_fk FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX user_idx (user_id)
  );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS user_address;');
}

export const _meta = {
  version: 1,
};
