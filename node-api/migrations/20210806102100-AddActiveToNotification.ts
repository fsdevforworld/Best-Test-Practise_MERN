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
    `INSERT into notification (type) VALUES
      ("SPECIAL_OFFERS"),
      ("PRODUCT_ANNOUNCEMENTS"),
      ("NEWSLETTER")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(
    `DELETE FROM notification WHERE type = 'SPECIAL_OFFERS' OR type = 'PRODUCT_ANNOUNCEMENTS' OR type = 'NEWSLETTER'`,
  );
}

export const _meta = {
  version: 1,
};
