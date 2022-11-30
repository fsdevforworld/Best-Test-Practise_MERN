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
  // backfill categories
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Travel') WHERE name = 'Airbnb Host';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Instacart Shopper';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Uber Eats Delivery Partner';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Uber Driver-Partner';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Lyft Driver';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Animal Services') WHERE name = 'Rover Pet Sitter';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Animal Services') WHERE name = 'Wag Dog Walker';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'DoorDash Delivery Partner';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Postmates Delivery Partner';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'SurveyJunkie';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Turo';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Technology') WHERE name = 'Gazelle';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Swagbucks';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Rev';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Paribus';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Shipt';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Cargo';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Inbox Dollars';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'User Testing';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'TranscribeMe';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Chegg Tutors';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Fiverr';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Upwork';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Tutor.com';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'TutorMe';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Pizza Hut';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'CVS Health';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Dollar Tree';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Transportation') WHERE name = 'Grubhub';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Etsy';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Walmart';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = 'Amazon';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Hourly') WHERE name = '7-Eleven';`,
  );
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_category_id = (SELECT id FROM side_hustle_category WHERE name = 'Government') WHERE name = 'Census';`,
  );

  // insert providers if not exist
  await db.runSql(`
    INSERT INTO side_hustle_provider (name, dave_authority)
    SELECT 'Dave', 1 FROM DUAL WHERE NOT EXISTS (SELECT 'x' FROM side_hustle_provider WHERE name = 'Dave');
    `);
  await db.runSql(`
    INSERT INTO side_hustle_provider (name, dave_authority)
    SELECT 'Appcast', 0 FROM DUAL WHERE NOT EXISTS (SELECT 'x' FROM side_hustle_provider WHERE name = 'Appcast');
    `);

  // update all existing jobs to set external_id where no external id set
  await db.runSql(
    `UPDATE side_hustle_jobs SET external_id = concat(id, '') WHERE external_id IS NULL;`,
  );
  // update all existing jobs to use the dave provider where no provider set
  await db.runSql(
    `UPDATE side_hustle_jobs SET side_hustle_provider_id = (SELECT id FROM side_hustle_provider WHERE name = 'Dave') WHERE side_hustle_provider_id IS NULL;`,
  );

  // make the external_id and provider_id columns NOT NULL and add a unique index
  await db.runSql(
    `ALTER TABLE side_hustle_jobs MODIFY COLUMN external_id varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs MODIFY COLUMN side_hustle_provider_id INT NOT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs ADD UNIQUE INDEX side_hustle_jobs_provider_id_external_id_uix(external_id, side_hustle_provider_id);`,
  );
  // add a unique index on category name
  await db.runSql(
    `ALTER TABLE side_hustle_category ADD UNIQUE INDEX side_hustle_category_name_uix(name);`,
  );
  // add a unique index on job pack name
  await db.runSql(
    `ALTER TABLE side_hustle_job_pack ADD UNIQUE INDEX side_hustle_job_pack_name_uix(name);`,
  );
  // add a unique index on job pack + provider
  await db.runSql(
    `ALTER TABLE side_hustle_job_pack_provider ADD UNIQUE INDEX side_hustle_job_pack_provider_job_pack_id_provider_id_uix(side_hustle_job_pack_id, side_hustle_provider_id);`,
  );
  // add a unique index on provider name
  await db.runSql(
    `ALTER TABLE side_hustle_provider ADD UNIQUE INDEX side_hustle_provider_name_uix(name);`,
  );
  // add a new column for small images for job packs
  await db.runSql(
    `ALTER TABLE side_hustle_job_pack ADD COLUMN image_small mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );

  return;
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`ALTER TABLE side_hustle_job_pack DROP COLUMN image_small;`);
  await db.runSql(`ALTER TABLE side_hustle_provider DROP INDEX side_hustle_provider_name_uix;`);
  await db.runSql(
    `ALTER TABLE side_hustle_job_pack_provider DROP INDEX side_hustle_job_pack_provider_job_pack_id_provider_id_uix;`,
  );
  await db.runSql(`ALTER TABLE side_hustle_job_pack DROP INDEX side_hustle_job_pack_name_uix;`);
  await db.runSql(`ALTER TABLE side_hustle_category DROP INDEX side_hustle_category_name_uix;`);
  await db.runSql(
    `ALTER TABLE side_hustle_jobs DROP INDEX side_hustle_jobs_provider_id_external_id_uix;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs MODIFY COLUMN side_hustle_provider_id INT DEFAULT NULL;`,
  );
  await db.runSql(
    `ALTER TABLE side_hustle_jobs MODIFY COLUMN external_id varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;`,
  );
  return;
}

export const _meta = {
  version: 1,
};
