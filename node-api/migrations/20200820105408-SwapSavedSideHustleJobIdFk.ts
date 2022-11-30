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
    'ALTER TABLE side_hustle_saved_job\
     DROP INDEX user_same_job_once_constraint',
  );

  await db.runSql('ALTER TABLE side_hustle_saved_job\
     DROP FOREIGN KEY side_hustle_job_id_fk');

  await db.runSql('ALTER TABLE side_hustle_saved_job\
     DROP KEY side_hustle_job_id_fk');

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     CHANGE `side_hustle_job_id` `side_hustle_id` bigint NOT NULL',
  );

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     ADD CONSTRAINT side_hustle_id_fk\
     FOREIGN KEY(side_hustle_id)\
     REFERENCES side_hustle(id)',
  );

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     ADD UNIQUE KEY user_side_hustle_uix (user_id, side_hustle_id)',
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('ALTER TABLE side_hustle_saved_job\
     DROP INDEX user_side_hustle_uix');

  await db.runSql('ALTER TABLE side_hustle_saved_job\
     DROP FOREIGN KEY side_hustle_id_fk');

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     CHANGE `side_hustle_id` `side_hustle_job_id` bigint NOT NULL',
  );

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     ADD CONSTRAINT side_hustle_job_id_fk\
     FOREIGN KEY(side_hustle_job_id)\
     REFERENCES side_hustle_jobs(id)',
  );

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     ADD CONSTRAINT user_same_job_once_constraint\
     UNIQUE (user_id, side_hustle_job_id)',
  );

  await db.runSql(
    'ALTER TABLE side_hustle_saved_job\
     ADD KEY side_hustle_job_id_fk(side_hustle_job_id)',
  );
}

export const _meta = {
  version: 1,
};
