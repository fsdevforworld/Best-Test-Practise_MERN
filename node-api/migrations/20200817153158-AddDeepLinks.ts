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
      ("transfer-in", "Authorized/Bank/BankStarter?navigateTo=TransferMoneyIn", "2.17.2"),
      ("ways-to-fund", "Authorized/Home/DaveBankAddMoney/AddMoneyInfo", "2.17.2"),
      ("bank-help", "Authorized/Account/Settings/Help/HelpCenter/BankHelpCenter", "2.17.2"),
      ("pause-membership", "Authorized/Account/Membership/PauseMembership/PauseOrCancelMembership", "2.17.2")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DELETE FROM deep_link WHERE min_version = ?', ['2.17.2']);
}

export const _meta = {
  version: 1,
};
