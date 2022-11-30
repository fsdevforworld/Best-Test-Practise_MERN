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
    `ALTER TABLE recurring_transaction
     MODIFY status ENUM(
       'VALID',
       'NOT_VALIDATED',
       'INVALID_NAME',
       'MISSED',
       'PENDING_VERIFICATION',
       'SINGLE_OBSERVATION'
     ) NOT NULL DEFAULT 'NOT_VALIDATED';`,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `UPDATE recurring_transaction
     SET status = 'NOT_VALIDATED'
     WHERE status = 'SINGLE_OBSERVATION';`,
  );
  await db.runSql(
    `ALTER TABLE recurring_transaction
     MODIFY status ENUM(
       'VALID',
       'NOT_VALIDATED',
       'INVALID_NAME',
       'MISSED',
       'PENDING_VERIFICATION',
     ) NOT NULL DEFAULT 'NOT_VALIDATED';`,
  );
}

export const _meta = {
  version: 1,
};
