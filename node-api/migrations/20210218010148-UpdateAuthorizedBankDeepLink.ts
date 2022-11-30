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
    `INSERT INTO deep_link (url, path, min_version) VALUES
      ("banking", "Authorized/Bank/BankingCreateAccountDeepLink", "2.36.0"),
      ("saves", "Authorized/Bank/BankingCreateAccountDeepLink", "2.36.0"),
      ("move-money", "Authorized/Bank", "2.36.0")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `DELETE FROM deep_link WHERE url = "banking" AND path = "Authorized/Bank/BankingCreateAccountDeepLink" AND min_version = "2.36.0";`,
  );
  await db.runSql(
    `DELETE FROM deep_link WHERE url = "saves" AND path = "Authorized/Bank/BankingCreateAccountDeepLink" AND min_version = "2.36.0";`,
  );
  await db.runSql(
    `DELETE FROM deep_link WHERE url = "move-money" AND path = "Authorized/Bank" AND min_version = "2.36.0";`,
  );
}

export const _meta = {
  version: 1,
};
