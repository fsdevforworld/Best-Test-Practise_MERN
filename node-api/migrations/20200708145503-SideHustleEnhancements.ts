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
  await db.runSql(
    `ALTER TABLE side_hustle_applications DROP FOREIGN KEY side_hustle_applications_job_id_fk;`,
  );
  await db.runSql(`ALTER TABLE side_hustle_jobs MODIFY COLUMN id bigint AUTO_INCREMENT;`);
  await db.runSql(`ALTER TABLE side_hustle_applications MODIFY COLUMN side_hustle_job_id bigint;`);
  await db.runSql(`ALTER TABLE side_hustle_applications MODIFY COLUMN id bigint AUTO_INCREMENT;`);
  await db.runSql(
    `ALTER TABLE side_hustle_applications ADD CONSTRAINT side_hustle_applications_job_id_fk FOREIGN KEY(side_hustle_job_id) REFERENCES side_hustle_jobs(id) ON DELETE CASCADE;`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `ALTER TABLE side_hustle_applications DROP FOREIGN KEY side_hustle_applications_job_id_fk;`,
  );
  await db.runSql(`ALTER TABLE side_hustle_applications MODIFY COLUMN id int AUTO_INCREMENT;`);
  await db.runSql(`ALTER TABLE side_hustle_jobs MODIFY COLUMN id int AUTO_INCREMENT;`);
  await db.runSql(`ALTER TABLE side_hustle_applications MODIFY COLUMN side_hustle_job_id int;`);
  await db.runSql(
    `ALTER TABLE side_hustle_applications ADD CONSTRAINT side_hustle_applications_job_id_fk FOREIGN KEY(side_hustle_job_id) REFERENCES side_hustle_jobs(id) ON DELETE CASCADE;`,
  );
}

export const _meta = {
  version: 1,
};
