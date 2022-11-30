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
  try {
    await db.runSql(
      "CREATE TABLE side_hustle(\
        id bigint NOT NULL AUTO_INCREMENT,\
        partner enum('APPCAST', 'DAVE') NOT NULL,\
        external_id varchar(256) NOT NULL,\
        is_active tinyint(1) NOT NULL DEFAULT '1',\
        name varchar(256) NOT NULL,\
        company varchar(256) NOT NULL,\
        cost_per_application decimal(16,2) DEFAULT NULL,\
        cost_per_click decimal(16,2) DEFAULT NULL,\
        affiliate_link varchar(2048) DEFAULT NULL,\
        description varchar(500) DEFAULT NULL,\
        logo varchar(500) DEFAULT NULL,\
        city varchar(256) DEFAULT NULL,\
        state varchar(256) DEFAULT NULL,\
        zip_code varchar(256) DEFAULT NULL,\
        country varchar(256) DEFAULT NULL,\
        side_hustle_category_id int DEFAULT NULL,\
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
        updated datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
        deleted datetime DEFAULT NULL,\
        posted_date datetime DEFAULT NULL,\
        PRIMARY KEY (id),\
        KEY partner_idx (partner),\
        UNIQUE KEY partner_external_id_uix (partner, external_id),\
        CONSTRAINT side_hustle_category_id_fk FOREIGN KEY(side_hustle_category_id) REFERENCES side_hustle_category(id) ON DELETE NO ACTION ON UPDATE NO ACTION\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    );
  } catch (ex) {
    await down(db);
    throw ex;
  }
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS side_hustle');
}

export const _meta = {
  version: 1,
};
