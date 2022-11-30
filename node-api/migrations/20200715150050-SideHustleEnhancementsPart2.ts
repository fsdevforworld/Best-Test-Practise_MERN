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
  CREATE TABLE side_hustle_provider (
    id int NOT NULL AUTO_INCREMENT,
    name varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    dave_authority tinyint(1) NOT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
  );
  `);

  await db.runSql(`
  CREATE TABLE side_hustle_category(
    id int NOT NULL AUTO_INCREMENT,
    name varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    priority int NOT NULL,
    image mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
  );
  `);

  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN description varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN cost_per_click decimal(11,4) DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN cost_per_application decimal(11,4) DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN country varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN state varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN city varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN zip varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN side_hustle_category_id int DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD CONSTRAINT side_hustle_jobs_category_id_fk FOREIGN KEY(side_hustle_category_id) REFERENCES side_hustle_category(id);`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD COLUMN side_hustle_provider_id int DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD CONSTRAINT side_hustle_jobs_provider_id_fk FOREIGN KEY(side_hustle_provider_id) REFERENCES side_hustle_provider(id);`,
  );
  await db.runSql(`ALTER TABLE side_hustle_jobs ADD COLUMN external_id varchar(256) DEFAULT NULL;`);

  await db.runSql(`
  CREATE TABLE side_hustle_saved_job(
    id bigint NOT NULL AUTO_INCREMENT,
    user_id int NOT NULL,
    side_hustle_job_id bigint NOT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    viewed datetime DEFAULT NULL,
    applied datetime DEFAULT NULL,
    PRIMARY KEY(id),
    KEY user_id_fk(user_id),
    KEY side_hustle_job_id_fk(side_hustle_job_id),
    CONSTRAINT user_same_job_once_constraint UNIQUE(user_id, side_hustle_job_id),
    CONSTRAINT user_id_fk FOREIGN KEY(user_id) REFERENCES user(id),
    CONSTRAINT side_hustle_job_id_fk FOREIGN KEY(side_hustle_job_id) REFERENCES side_hustle_jobs(id)
  );
  `);

  await db.runSql(`
  CREATE TABLE side_hustle_job_pack(
    id bigint NOT NULL AUTO_INCREMENT,
    name varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    sort_by varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    sort_order tinyint(1) NOT NULL,
    image mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    bgcolor char(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
  );
  `);

  await db.runSql(`
  CREATE TABLE side_hustle_job_pack_search(
    id bigint NOT NULL AUTO_INCREMENT,
    side_hustle_job_pack_id bigint NOT NULL,
    term varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    value varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    KEY side_hustle_job_pack_search_job_pack_id_fk(side_hustle_job_pack_id),
    CONSTRAINT side_hustle_job_pack_search_job_pack_id_fk FOREIGN KEY(side_hustle_job_pack_id) REFERENCES side_hustle_job_pack(id)
  );
  `);

  await db.runSql(`
  CREATE TABLE side_hustle_job_pack_provider(
    id bigint NOT NULL AUTO_INCREMENT,
    side_hustle_job_pack_id bigint NOT NULL,
    side_hustle_provider_id int NOT NULL,
    created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    KEY side_hustle_job_pack_provider_job_pack_id_fk(side_hustle_job_pack_id),
    CONSTRAINT side_hustle_job_pack_provider_job_pack_id_fk FOREIGN KEY(side_hustle_job_pack_id) REFERENCES side_hustle_job_pack(id),
    KEY side_hustle_job_provider_id_fk(side_hustle_provider_id),
    CONSTRAINT side_hustle_job_provider_id_fk FOREIGN KEY(side_hustle_provider_id) REFERENCES side_hustle_provider(id)
  );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_job_pack_provider;`);
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_job_pack_search;`);
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_job_pack;`);
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_saved_job;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP INDEX external_id_index;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN external_id;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP FOREIGN KEY side_hustle_jobs_provider_id_fk;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN side_hustle_provider_id;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP FOREIGN KEY side_hustle_jobs_category_id_fk;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN side_hustle_category_id;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN zip;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN city;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN state;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN country;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN cost_per_application;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN cost_per_click;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs DROP COLUMN description;`);
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_category;`);
  await db.runSql(`DROP TABLE IF EXISTS side_hustle_provider;`);
}

export const _meta = {
  version: 1,
};
