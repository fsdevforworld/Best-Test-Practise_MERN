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
    `ALTER TABLE side_hustle_job_pack MODIFY COLUMN sort_order ENUM('ASC', 'DESC', 'RANDOM') NOT NULL;`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`ALTER TABLE side_hustle_job_pack MODIFY COLUMN sort_order tinyint(1) NOT NULL;`);
}

export const _meta = {
  version: 1,
};
