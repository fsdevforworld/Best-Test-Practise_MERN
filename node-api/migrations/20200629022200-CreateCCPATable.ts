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
  return db.runSql(
    `CREATE TABLE ccpa_request (
  id int(11) NOT NULL AUTO_INCREMENT,
  user_id int(11) DEFAULT NULL,
  status enum('RECEIVED','INFORMATION_COLLECTION','INFORMATION_MISMATCH','INFORMATION_SENT', 'COMPLETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'RECEIVED',
  first_name varchar(256) COLLATE utf8mb4_unicode_ci NULL,
  last_name varchar(256) COLLATE utf8mb4_unicode_ci NULL,
  email varchar(256) COLLATE utf8mb4_unicode_ci NULL,
  ssn varchar(256) COLLATE utf8mb4_unicode_ci NULL,
  birthdate date NULL,
  request_type enum('REQUEST', 'DELETION') COLLATE utf8mb4_unicode_ci NOT NULL,
  details text COLLATE utf8mb4_unicode_ci NULL,
  created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated datetime default CURRENT_TIMESTAMP NULL on update CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
    CONSTRAINT ccpa_request_user_id_fk
    FOREIGN KEY (user_id) REFERENCES user (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS `ccpa_request`;');
}

export const _meta = {
  version: 1,
};
