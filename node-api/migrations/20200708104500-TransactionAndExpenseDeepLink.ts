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
    `INSERT into deep_link (url, path, min_version) VALUES
      ("transaction", "Authorized/Home/TransactionDetails", "2.16.5"),
      ("expense", "Authorized/Home/RecurringExpense", "2.16.5")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DELETE FROM deep_link WHERE url = ?', ['transaction', 'expense']);
}

export const _meta = {
  version: 1,
};
