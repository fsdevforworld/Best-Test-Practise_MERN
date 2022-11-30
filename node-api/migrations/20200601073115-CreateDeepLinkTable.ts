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
    'CREATE TABLE `deep_link`(\
      `id` int(11) NOT NULL AUTO_INCREMENT,\
      `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,\
      `path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,\
      `min_version` varchar(255) NOT NULL, \
      `max_version` varchar(255) DEFAULT NULL,\
      `deleted` datetime DEFAULT NULL,\
      `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
      `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
      PRIMARY KEY (`id`),\
      KEY `deletedx` (`deleted`),\
      KEY `urlx` (`url`)\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
  );
  await db.runSql(
    `INSERT into deep_link (url, path, min_version) VALUES
      ("advance", "Authorized/Advance", "2.13.4"),
      ("banking", "Authorized/Bank", "2.13.4"),
      ("connect", "", "2.13.4"),
      ("credit-builder","Authorized/Bank/BankStarter?navigateTo=BankCreditBuilderDeepLink&source=email", "2.13.4"),
      ("transfer-money", "Authorized/Bank/BankStarter?navigateTo=TransferMoney", "2.13.4"),
      ("direct-deposit", "Authorized/Bank/BankStarter?navigateTo=SetUpDirectDepositBankV2", "2.13.4"),
      ("manage-card", "Authorized/Bank/BankStarter?navigateTo=ManageDebitCard", "2.13.4"),
      ("direct-deposit-advances","Authorized/Bank/BankStarter?navigateTo=DirectDepositAdvancesDeepLink", "2.13.4"),
      ("direct-deposit-explainer","Authorized/Bank/BankStarter?navigateTo=DirectDepositExplainerDeepLink", "2.13.4"),
      ("direct-deposit-get-paid-early","Authorized/Bank/BankStarter?navigateTo=DirectDepositGetPaidEarlyDeepLink", "2.13.4"),
      ("virtual-card","Authorized/Bank/BankStarter?navigateTo=ManageVirtualCard", "2.13.4"),
      ("atm","Authorized/Bank/BankStarter?navigateTo=ATMLocator", "2.13.4"),
      ("send-check","Authorized/Bank/BankStarter?navigateTo=SendCheckNav", "2.13.4"),
      ("low-balance", "Authorized/Home", "2.13.4"),
      ("manage-income", "Authorized/Paychecks", "2.13.4"),
      ("open", "", "2.13.4"),
      ("pay-dave", "Authorized/Account/Profile/ProfileAdvances", "2.13.4"),
      ("payment", "Authorized/Account/Profile/ProfileAdvances", "2.13.4"),
      ("payments", "Authorized/Account/Profile/ProfileAdvances", "2.13.4"),
      ("reconnect", "Authorized/Home/ReconnectBank", "2.13.4"),
      ("review", "Authorized/Home?showReview=1", "2.13.4"),
      ("saves", "Authorized/Bank", "2.13.4"),
      ("select-income", "Authorized/Home/SelectIncome", "2.13.4"),
      ("set-password", "Unauthorized/SetAPassword", "2.13.4"),
      ("side-hustle", "Authorized/Home/SideHustle", "2.13.4"),
      ("unsupported", "", "2.13.4"),
      ("update-tip", "Authorized/Account/UpdateTip", "2.13.4"),
      ("verified", "", "2.13.4"),
      ("verify", "", "2.13.4"),
      ("expenses", "Authorized/Home/ManageExpenses", "2.13.4"),
      ("refer", "Authorized/Account/InviteFriends", "2.13.4"),
      ("account", "Authorized/Account", "2.13.4"),
      ("info", "Authorized/Account/UpdateInfo", "2.13.4")
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS `deep_link`;');
}

export const _meta = {
  version: 1,
};
