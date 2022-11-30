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
      ("advance", "Authorized/BottomTabBar/Advance", "2.48.0"),
      ("banking", "Authorized/BottomTabBar/Bank", "2.48.0"),
      ("credit-builder", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=BankCreditBuilderDeepLink&source=email", "2.48.0"),
      ("transfer-money", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=TransferMoney", "2.48.0"),
      ("direct-deposit", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=SetUpDirectDepositBankV2", "2.48.0"),
      ("manage-card", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=ManageDebitCard", "2.48.0"),
      ("direct-deposit-advances", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=DirectDepositAdvancesDeepLink", "2.48.0"),
      ("direct-deposit-explainer", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=DirectDepositExplainerDeepLink", "2.48.0"),
      ("direct-deposit-get-paid-early", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=DirectDepositGetPaidEarlyDeepLink", "2.48.0"),
      ("virtual-card", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=ManageVirtualCard", "2.48.0"),
      ("atm", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=ATMLocator", "2.48.0"),
      ("send-check", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=SendCheckNav", "2.48.0"),
      ("low-balance", "Authorized/BottomTabBar/Home", "2.48.0"),
      ("pay-dave", "Authorized/BottomTabBar/Account/AdvancesHistory", "2.48.0"),
      ("payment", "Authorized/BottomTabBar/Account/AdvancesHistory", "2.48.0"),
      ("payments", "Authorized/BottomTabBar/Account/AdvancesHistory", "2.48.0"),
      ("reconnect", "Authorized/BottomTabBar/Home/ReconnectBank", "2.48.0"),
      ("saves", "Authorized/BottomTabBar/Bank", "2.48.0"),
      ("select-income", "Authorized/BottomTabBar/Home/SelectIncome", "2.48.0"),
      ("side-hustle", "Authorized/BottomTabBar/Home/SideHustle", "2.48.0"),
      ("update-tip", "Authorized/BottomTabBar/Account/UpdateTip", "2.48.0"),
      ("expenses", "Authorized/BottomTabBar/Home/ManageExpenses", "2.48.0"),
      ("manage-income", "Authorized/BottomTabBar/Home/ManageIncome", "2.48.0"),
      ("refer", "Authorized/BottomTabBar/Account/InviteFriends", "2.48.0"),
      ("account", "Authorized/BottomTabBar/Account", "2.48.0"),
      ("info", "Authorized/BottomTabBar/Account/UpdateInfo", "2.48.0"),
      ("transaction", "Authorized/BottomTabBar/Home/TransactionDetails", "2.48.0"),
      ("expense", "Authorized/BottomTabBar/Home/RecurringExpense", "2.48.0"),
      ("update-tip", "Authorized/BottomTabBar/Account/AdvancesHistory/UpdateTip", "2.48.0"),
      ("transfer-in", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=TransferMoneyIn", "2.48.0"),
      ("ways-to-fund", "Authorized/DaveBankAddMoney/AddMoneyInfo", "2.48.0"),
      ("pause-membership", "Authorized/BottomTabBar/Account/MembershipManage/PauseMembership/PauseOrCancelMembership", "2.48.0"),
      ("bank-statements", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=BankStatements", "2.48.0"),
      ("side-hustle", "Authorized/BottomTabBar/Account/Hustle", "2.48.0"),
      ("saved-hustles", "Authorized/BottomTabBar/Account/SavedHustles", "2.48.0"),
      ("job-pack", "Authorized/BottomTabBar/Account/Hustle/JobPack", "2.48.0"),
      ("side-hustle-job", "Authorized/BottomTabBar/Account/Hustle/JobListing", "2.48.0"),
      ("cash-check", "Authorized/BottomTabBar/Bank/BankStarter?navigateTo=MeetIngo", "2.48.0"),
      ("refer", "Authorized/BottomTabBar/Home/InviteFriends", "2.48.0"),
      ("banking", "Authorized/BottomTabBar/Bank/BankingCreateAccountDeepLink", "2.48.0"),
      ("saves", "Authorized/BottomTabBar/Bank/BankingCreateAccountDeepLink", "2.48.0"),
      ("move-money", "Authorized/BottomTabBar/Bank", "2.48.0"),
      ("goals", "Authorized/BottomTabBar/Goals/GoalsEntryScreen", "2.48.0"),
      ("banking-features", "Authorized/BankFeaturesOnboarding", "2.48.0")
    `,
  );
  await db.runSql(`
    UPDATE deep_link
    SET max_version = '2.47.1'
    WHERE url = 'bank-help';
  `);
}

export async function down(db: DBItem): Promise<void> {
  return await db.runSql(`DELETE FROM deep_link WHERE min_version = "2.48.0";`);
}

export const _meta = {
  version: 1,
};
