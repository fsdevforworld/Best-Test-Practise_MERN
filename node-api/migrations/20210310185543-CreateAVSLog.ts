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
    CREATE TABLE avs_log (
      id int(11) NOT NULL AUTO_INCREMENT,
      user_id int(11) NOT NULL,
      payment_method_id int(11),
      PRIMARY KEY (id),
      cvv_match tinyint(1) NOT NULL DEFAULT '0',
      address_match tinyint(1) NOT NULL DEFAULT '0',
      zip_match tinyint(1) NOT NULL DEFAULT '0',
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT avs_log_user_fk FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT avs_log_payment_method_fk FOREIGN KEY (payment_method_id) REFERENCES payment_method (id) ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX payment_method_idx (payment_method_id),
      INDEX user_idx (user_id)
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS avs_log;');
}

export const _meta = {
  version: 1,
};
