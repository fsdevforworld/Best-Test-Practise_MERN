import { DBItem, DBType } from 'db-migrate';

export let dbm: any;
export let type: DBType;

export function setup(options: any): void {
  dbm = options.dbmigrate;
  type = dbm.dataType;
}

export async function up(db: DBItem) {
  return db.runSql(`
  CREATE TABLE dashboard_bulk_update (
    id int(11) NOT NULL AUTO_INCREMENT,
    input_file_url varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    input_file_row_count int(11) NOT NULL,
    dashboard_action_log_id int(11) NOT NULL,
    output_file_url varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    status enum('PENDING','PROCESSING','CANCELLED','FAILED', 'COMPLETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT action_log_fk FOREIGN KEY (dashboard_action_log_id) REFERENCES dashboard_action_log (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS dashboard_bulk_update;');
}

export const _meta = {
  version: 1,
};
