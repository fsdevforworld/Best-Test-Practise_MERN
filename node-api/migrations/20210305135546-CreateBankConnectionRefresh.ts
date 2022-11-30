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
  CREATE TABLE bank_connection_refresh (
      id int(11) NOT NULL AUTO_INCREMENT,
      bank_connection_id int(11) NOT NULL,
      status ENUM('CREATED', 'REQUESTED', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'ERROR') NOT NULL DEFAULT 'CREATED',
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      requested_at datetime DEFAULT NULL,
      received_at datetime DEFAULT NULL,
      processing_at datetime DEFAULT NULL,
      completed_at datetime DEFAULT NULL,
      error_at datetime DEFAULT NULL,
      error_code varchar(256) DEFAULT NULL,
      PRIMARY KEY (id),
      CONSTRAINT bank_connection_refresh_bank_connection_fk FOREIGN KEY (bank_connection_id) REFERENCES bank_connection (id) ON DELETE CASCADE,
      INDEX bank_connection_refresh_status_idx (status),
      INDEX bank_connection_refresh_error_code_idx (error_code)
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS bank_connection_refresh');
}

export const _meta = {
  version: 1,
};
