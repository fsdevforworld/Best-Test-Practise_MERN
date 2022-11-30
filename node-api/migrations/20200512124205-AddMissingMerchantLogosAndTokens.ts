import { DBItem, DBType } from 'db-migrate';
import MerchantInfo from '../src/models/merchant-info';
import BankTransactionToken from '../src/models/bank-transaction-token';
import logger from '../src/lib/logger';

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
  await migrateMissingMerchants(db);
  await migrateWrongLogosUp(db);
  await migrateMerchantsWithoutTokensUp(db);
}

export async function down(db: DBItem): Promise<void> {
  await migrateWrongLogosDown(db);
  await migrateMerchantsWithoutTokensDown(db);
}

// Values match production database. These merchants were ommitted from the dev/stage migrations.
// In Production ids will cause duplicate key error so these inserts will be skipped over.
const missingMerchantRecords: Array<Partial<MerchantInfo>> = [
  {
    id: 4681,
    name: 'ale house',
    displayName: 'Waffle House',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/waffle-house@3x.png',
    uniqueUsersCount: 417,
  },
  {
    id: 4985,
    name: 'apple store',
    displayName: 'Apple',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/apple@3x.png',
    uniqueUsersCount: 418,
  },
  {
    id: 6004,
    name: 'birchbox',
    displayName: 'BirchBox',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/birchbox@3x.png',
    uniqueUsersCount: 522,
  },
  {
    id: 6125,
    name: 'bojangles',
    displayName: 'BOJANGLES',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/bojangles@3x.png',
    uniqueUsersCount: 2617,
  },
  {
    id: 9970,
    name: 'wetzels',
    displayName: "Wetzel's Pretzels",
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/wetzels-pretzels@3x.png',
    uniqueUsersCount: 408,
  },
  {
    id: 14618,
    name: 'club sam',
    displayName: "Sam's Club",
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/sams-club@3x.png',
    uniqueUsersCount: 2143,
  },
  {
    id: 18367,
    name: 'supercuts',
    displayName: 'Supercuts',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/supercuts@3x.png',
    uniqueUsersCount: 433,
  },
  {
    id: 18897,
    name: 'smoothie cafe',
    displayName: 'Tropical Smoothie Cafe',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/tropical-smoothie-cafe@3x.png',
    uniqueUsersCount: 400,
  },
  {
    id: 19223,
    name: 'shake shack',
    displayName: 'Shake Shack',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/shake-shack@3x.png',
    uniqueUsersCount: 420,
  },
  {
    id: 19305,
    name: 'hour fitness',
    displayName: '24Hour Fitness',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/24hour-fitness@3x-01.png',
    uniqueUsersCount: 440,
  },
  {
    id: 19658,
    name: 'hilton',
    displayName: 'Hilton',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/hilton@3x.png',
    uniqueUsersCount: 434,
  },
  {
    id: 20791,
    name: 'hy vee',
    displayName: 'Hy-Vee',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/hy-vee@3x.png',
    uniqueUsersCount: 736,
  },
  {
    id: 20944,
    name: 'raising cane chicken',
    displayName: "Raising Cane's Chicken Fingers",
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/raising-canes-chicken-fingers@3x.png',
    uniqueUsersCount: 1960,
  },
  {
    id: 20983,
    name: 'in out burger',
    displayName: 'In-N-Out Burger',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/in-n-out-burger@3x-01.png',
    uniqueUsersCount: 2119,
  },
  {
    id: 21007,
    name: 'smoothie',
    displayName: 'Smoothie King',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/smoothie-king@3x.png',
    uniqueUsersCount: 1983,
  },
  {
    id: 21526,
    name: 'circle k',
    displayName: 'Circle K',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/circle-k@3x.png',
    uniqueUsersCount: 15627,
  },
  { id: 8755, name: 'citibank na', displayName: '', logo: '', uniqueUsersCount: 798 },
  {
    id: 21580,
    name: 'att',
    displayName: 'AT&T',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/att@3x-20200511.png',
    uniqueUsersCount: 0,
  },
  {
    id: 21581,
    name: 't-mobile',
    displayName: 'T-Mobile',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/t-mobile@3x-20200511.png',
    uniqueUsersCount: 0,
  },
  {
    id: 21582,
    name: 'wendy s',
    displayName: "Wendy's",
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/wendys@3x-20200511.png',
    uniqueUsersCount: 0,
  },
  { id: 7187, name: 'progressive insu', displayName: '', logo: '', uniqueUsersCount: 2442 },
  {
    id: 22583,
    name: 'liberty mutual',
    displayName: 'Liberty Mutual',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/liberty-mutual@3x-20200511.png',
    uniqueUsersCount: 0,
  },
  {
    id: 22584,
    name: 'disney plus',
    displayName: 'DisneyPLUS',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/disney-plus@3x-20200511.png',
    uniqueUsersCount: 0,
  },
];
async function migrateMissingMerchants(db: DBItem): Promise<void> {
  const results = await Promise.all(
    missingMerchantRecords.map(m =>
      db
        .runSql(
          `INSERT INTO merchant_info (id, name, display_name, url, logo, unique_users_count, exclude) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [m.id, m.name, m.displayName, '', m.logo, m.uniqueUsersCount, 0],
        )
        .catch(e => false),
    ),
  );
  const numFailed = results.filter(x => x === false).length;
  const numSuccess = results.length - numFailed;
  if (numFailed) {
    // In case of failures console log to alert that a portion failed.
    logger.info(
      `Adding missing merchant failed to insert ${numFailed} records. ${numSuccess} merchants successfully inserted.`,
    );
  }
}

const missingBankTransactionTokenMappings: Array<Partial<BankTransactionToken>> = [
  {
    merchantInfoId: 4681,
    tokenString: 'waffle ho',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 4681,
    tokenString: 'waffle hou',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 4681,
    tokenString: 'waffle hous',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 4681,
    tokenString: 'waffle house',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 4985,
    tokenString: 'apple co',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
  },
  {
    merchantInfoId: 4985,
    tokenString: 'apple com',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
  },
  {
    merchantInfoId: 4985,
    tokenString: 'apple online',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
  },
  {
    merchantInfoId: 4985,
    tokenString: 'apple store',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
  },
  {
    merchantInfoId: 4985,
    tokenString: 'apple stor',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
  },
  {
    merchantInfoId: 6004,
    tokenString: 'birchbo',
    category: 'Shops',
    subCategory: 'Beauty Products',
  },
  {
    merchantInfoId: 6004,
    tokenString: 'birchbox',
    category: 'Shops',
    subCategory: 'Beauty Products',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojang',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojang',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangl',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangl',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangle',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangle',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangles',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 6125,
    tokenString: 'bojangles',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel pretzels',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel pretzels',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel pretzel',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel pretzel',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel s pretzels',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel s pretzels',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel s pretzel',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzel s pretzel',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzels',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 9970,
    tokenString: 'wetzels',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 18367,
    tokenString: 'supercuts',
    category: 'Service',
    subCategory: 'Personal Care',
  },
  {
    merchantInfoId: 18367,
    tokenString: 'super cuts',
    category: 'Service',
    subCategory: 'Personal Care',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smooth',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smooth',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smoothi',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smoothi',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smoothie',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 18897,
    tokenString: 'tropical smoothie',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sams club',
    category: 'Shops',
    subCategory: 'Department Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sams club',
    category: 'Shops',
    subCategory: 'Discount Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sams club',
    category: 'Shops',
    subCategory: 'Warehouses and Wholesale Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sams club',
    category: 'Travel',
    subCategory: 'Gas Stations',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam s club',
    category: 'Shops',
    subCategory: 'Department Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam s club',
    category: 'Shops',
    subCategory: 'Discount Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam s club',
    category: 'Shops',
    subCategory: 'Warehouses and Wholesale Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam s club',
    category: 'Travel',
    subCategory: 'Gas Stations',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'samsclub',
    category: 'Shops',
    subCategory: 'Department Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'samsclub',
    category: 'Shops',
    subCategory: 'Discount Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'samsclub',
    category: 'Shops',
    subCategory: 'Warehouses and Wholesale Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'samsclub',
    category: 'Travel',
    subCategory: 'Gas Stations',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam sclub',
    category: 'Shops',
    subCategory: 'Department Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam sclub',
    category: 'Shops',
    subCategory: 'Discount Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam sclub',
    category: 'Shops',
    subCategory: 'Warehouses and Wholesale Stores',
  },
  {
    merchantInfoId: 14618,
    tokenString: 'sam sclub',
    category: 'Travel',
    subCategory: 'Gas Stations',
  },
  {
    merchantInfoId: 9728,
    tokenString: 'discover',
    category: 'Payment',
    subCategory: 'Credit Card',
  },
  {
    merchantInfoId: 19223,
    tokenString: 'shakeshack',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 19223,
    tokenString: 'shakeshack',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 19223,
    tokenString: 'shake shack',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 19223,
    tokenString: 'shake shack',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 19305,
    tokenString: 'hour fitnes',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
  },
  {
    merchantInfoId: 19305,
    tokenString: 'hour fitness',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
  },
  {
    merchantInfoId: 19305,
    tokenString: 'hr fitness',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
  },
  {
    merchantInfoId: 19305,
    tokenString: '24hr fitness',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
  },
  { merchantInfoId: 19658, tokenString: 'hilton', category: 'Travel', subCategory: 'Lodging' },
  {
    merchantInfoId: 20791,
    tokenString: 'hy-vee',
    category: 'Shops',
    subCategory: 'Supermarkets and Groceries',
  },
  {
    merchantInfoId: 20791,
    tokenString: 'hy-vee',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 20791,
    tokenString: 'hy-vee',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 20791,
    tokenString: 'hy vee',
    category: 'Shops',
    subCategory: 'Supermarkets and Groceries',
  },
  {
    merchantInfoId: 20791,
    tokenString: 'hy vee',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 20791,
    tokenString: 'hy vee',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
  },
  {
    merchantInfoId: 20944,
    tokenString: 'raising cane',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 20944,
    tokenString: 'raising cane',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 20983,
    tokenString: 'n out bu',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 20983,
    tokenString: 'n out bur',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 20983,
    tokenString: 'n out burg',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 20983,
    tokenString: 'n out burge',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 20983,
    tokenString: 'n out burger',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 21007,
    tokenString: 'smoothie king',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 21007,
    tokenString: 'smoothie king',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 21007,
    tokenString: 'smoothieking',
    category: 'Service',
    subCategory: 'Food and Beverage',
  },
  {
    merchantInfoId: 21007,
    tokenString: 'smoothieking',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 21526,
    tokenString: 'circle k',
    category: 'Shops',
    subCategory: 'Convenience Stores',
  },
  {
    merchantInfoId: 21526,
    tokenString: 'circle k',
    category: 'Travel',
    subCategory: 'Gas Stations',
  },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Bank Fees', subCategory: 'ATM' },
  {
    merchantInfoId: 8755,
    tokenString: 'citibank',
    category: 'Bank Fees',
    subCategory: 'Overdraft',
  },
  {
    merchantInfoId: 8755,
    tokenString: 'citibank',
    category: 'Bank Fees',
    subCategory: 'Foreign Transaction',
  },
  {
    merchantInfoId: 8755,
    tokenString: 'citibank',
    category: 'Bank Fees',
    subCategory: 'Insufficient Funds',
  },
  {
    merchantInfoId: 8755,
    tokenString: 'citibank',
    category: 'Payment',
    subCategory: 'Credit Card',
  },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Service', subCategory: 'Financial' },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Transfer', subCategory: 'Debit' },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Transfer', subCategory: 'Credit' },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Transfer', subCategory: 'Deposit' },
  { merchantInfoId: 8755, tokenString: 'citibank', category: 'Transfer', subCategory: 'Debit' },
  {
    merchantInfoId: 8755,
    tokenString: 'citibank',
    category: 'Transfer',
    subCategory: 'Withdrawal',
  },
  {
    merchantInfoId: 21580,
    tokenString: 'att',
    category: 'Service',
    subCategory: 'Telecommunication Services',
  },
  { merchantInfoId: 21580, tokenString: 'att', category: 'Service', subCategory: 'Cable' },
  { merchantInfoId: 21580, tokenString: 'att', category: 'Service', subCategory: 'Utilities' },
  {
    merchantInfoId: 21580,
    tokenString: 'at t',
    category: 'Service',
    subCategory: 'Telecommunication Services',
  },
  { merchantInfoId: 21580, tokenString: 'at t', category: 'Service', subCategory: 'Cable' },
  { merchantInfoId: 21580, tokenString: 'at t', category: 'Service', subCategory: 'Utilities' },
  {
    merchantInfoId: 21581,
    tokenString: 't mobile',
    category: 'Service',
    subCategory: 'Telecommunication Services',
  },
  {
    merchantInfoId: 21581,
    tokenString: 't-mobile',
    category: 'Service',
    subCategory: 'Telecommunication Services',
  },
  {
    merchantInfoId: 21581,
    tokenString: 'tmobile',
    category: 'Service',
    subCategory: 'Telecommunication Services',
  },
  {
    merchantInfoId: 21582,
    tokenString: 'wendy s',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive ins',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insu',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insur',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insura',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insuran',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insuranc',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 7187,
    tokenString: 'progressive insurance',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22583,
    tokenString: 'liberty mu',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22583,
    tokenString: 'liberty mut',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22583,
    tokenString: 'liberty mutu',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22583,
    tokenString: 'liberty mutua',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22583,
    tokenString: 'liberty mutual',
    category: 'Service',
    subCategory: 'Insurance',
  },
  {
    merchantInfoId: 22584,
    tokenString: 'disneyplus',
    category: 'Recreation',
    subCategory: 'Arts and Entertainment',
  },
  { merchantInfoId: 22584, tokenString: 'disneyplus', category: 'Transfer', subCategory: 'Debit' },
  {
    merchantInfoId: 22584,
    tokenString: 'disneyplus',
    category: 'Transfer',
    subCategory: 'Withdrawal',
  },
];
async function migrateMerchantsWithoutTokensUp(db: DBItem): Promise<void> {
  await Promise.all(
    missingBankTransactionTokenMappings.map(m =>
      db.runSql(
        `INSERT INTO bank_transactions_tokens (token_string, merchant_info_id, category, sub_category) VALUES (?, ?, ?, ?)`,
        [m.tokenString, m.merchantInfoId, m.category, m.subCategory],
      ),
    ),
  );
}
async function migrateMerchantsWithoutTokensDown(db: DBItem): Promise<void> {
  await Promise.all(
    missingBankTransactionTokenMappings.map(m =>
      db.runSql(
        `DELETE FROM bank_transactions_tokens WHERE token_string=? AND merchant_info_id=? AND category=? AND sub_category=?`,
        [m.tokenString, m.merchantInfoId, m.category, m.subCategory],
      ),
    ),
  );
}

const wrongLogoMerchants: Array<Partial<MerchantInfo>> = [
  {
    id: 19094,
    name: 'sbarro',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/sbarro.png',
  },
  {
    id: 20930,
    name: 'forever',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/forever-21.png',
  },
  {
    id: 21229,
    name: 'groupon',
    logo: 'https://storage.googleapis.com/dave-images/images-production/merchants/groupon.png',
  },
  {
    id: 19305,
    name: 'hour fitness',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/24hour-fitness@3x-20200511.png',
  },
  {
    id: 9728,
    name: 'single discover payment',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/discover-card@3x-20200511.png',
  },
  {
    id: 8755,
    name: 'citibank na',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/citibank@3x-20200511.png',
  },
  {
    id: 7187,
    name: 'progressive insu',
    logo:
      'https://storage.googleapis.com/dave-images/images-production/merchants/progressive@3x-20200511.png',
  },
];
const oldLogoMap: Map<number, string> = new Map()
  .set(19094, 'undefined')
  .set(20930, 'undefined')
  .set(21229, 'undefined')
  .set(
    19305,
    'https://storage.googleapis.com/dave-images/images-production/merchants/24hour-fitness@3x-01.png',
  )
  .set(
    9728,
    'https://storage.googleapis.com/dave-images/images-production/merchants/discover-card@3x.png',
  )
  .set(8755, '')
  .set(7187, '');
async function migrateWrongLogosUp(db: DBItem): Promise<void> {
  await Promise.all(
    wrongLogoMerchants.map(m =>
      db.runSql(`UPDATE merchant_info SET logo=? WHERE id=? AND name=?`, [m.logo, m.id, m.name]),
    ),
  );
}
async function migrateWrongLogosDown(db: DBItem): Promise<void> {
  await Promise.all(
    wrongLogoMerchants.map(m =>
      db.runSql(`UPDATE merchant_info SET logo=? WHERE id=? AND name=?`, [
        oldLogoMap.get(m.id),
        m.id,
        m.name,
      ]),
    ),
  );
}

export const _meta = {
  version: 1,
};
