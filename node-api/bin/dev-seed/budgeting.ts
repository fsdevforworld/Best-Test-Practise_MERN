import * as Faker from 'faker';

import {
  createUser,
  insertOnboardingSteps,
  getUniqueSynapseData,
  setDefaultBankAccount,
  insertRandomExpenseTransaction,
  insertNormalIncomeTransactions,
  RandomExpenseOptions,
} from './utils';
import { deleteUser } from './delete-user';
import factory from '../../test/factories';
import * as moment from 'moment';

// (283)438 = BUDGET
const AREA_CODE = '283';
const PREFIX = '438';
async function up(phoneNumberSeed: string = AREA_CODE) {
  await create({
    phoneNumberSeed,
    budgetUserId: '0001', // 2834380001
    comment: '3 Expense Transactions',
    numExpenses: 3,
    available: 1400,
    current: 1400,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0002', // 2834380002
    comment: 'Non Recent Expenses',
    numExpenses: 100,
    expensesToDate: moment()
      .subtract(3, 'months')
      .format('YYYY-MM-DD'),
    expensesFromDate: moment()
      .subtract(1, 'year')
      .format('YYYY-MM-DD'),
    available: 1400,
    current: 1400,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0003', // 2834380003
    comment: 'No Available Balance',
    numExpenses: 100,
    available: null,
    current: 1400,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0004', // 2834380004
    comment: 'No Expenses',
    available: null,
    current: 1400,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0005', // 2834380005
    comment: 'Recurring Income + Expenses',
    numExpenses: 3,
    includeRecurringExpenses: true,
    includeIncome: true,
    available: null,
    current: 1400,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0006', // 2834380006,
    comment: 'Unmatched merchant expenses',
    includeRecurringExpenses: false,
    includeIncome: false,
    available: null,
    current: 1400,
    expensesToDate: moment()
      .subtract(1, 'day')
      .format('YYYY-MM-DD'),
    expensesFromDate: moment()
      .subtract(1, 'month')
      .format('YYYY-MM-DD'),
    expenseOptionList: exampleExpenses,
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0007', // 2834380007,
    comment: 'High confidence matches',
    includeRecurringExpenses: false,
    includeIncome: true,
    available: -100,
    current: -100,
    includeSpecificTransactions: true,
    // create some high confidence matches so auto expense detection works
    expenseOptionList: exampleExpenses.reduce((acc, item, idx) => {
      const insertHighConfidence = idx % 9 === 0;
      if (insertHighConfidence) {
        const interval = idx % 2 === 0 ? 'month' : 'week';
        acc.push({ ...item, date: moment().subtract(0, interval) });
        acc.push({ ...item, date: moment().subtract(1, interval) });
        acc.push({ ...item, date: moment().subtract(2, interval) });
        acc.push({ ...item, date: moment().subtract(3, interval) });
        return acc;
      }
      acc.push(item);
      return acc;
    }, []),
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0008', // 2834380008,
    comment: 'Many Recurring Trxns',
    includeRecurringExpenses: false,
    includeIncome: true,
    available: null,
    current: 1400,
    // create some high confidence matches so auto expense detection works
    expenseOptionList: exampleExpenses.reduce((acc, item, idx) => {
      const insertHighConfidence = idx % 3 === 0;
      if (insertHighConfidence) {
        const interval = idx % 2 === 0 ? 'months' : 'weeks';
        acc.push({ ...item, date: moment().subtract(0, interval) });
        acc.push({ ...item, date: moment().subtract(1, interval) });
        acc.push({ ...item, date: moment().subtract(2, interval) });
        acc.push({ ...item, date: moment().subtract(3, interval) });
        acc.push({ ...item, date: moment().subtract(4, interval) });
        acc.push({ ...item, date: moment().subtract(5, interval) });
        acc.push({ ...item, date: moment().subtract(6, interval) });
        acc.push({ ...item, date: moment().subtract(7, interval) });
        acc.push({ ...item, date: moment().subtract(8, interval) });
        acc.push({ ...item, date: moment().subtract(9, interval) });
        acc.push({ ...item, date: moment().subtract(10, interval) });
        return acc;
      }
      acc.push(item);
      return acc;
    }, []),
  });

  await create({
    phoneNumberSeed,
    budgetUserId: '0009', // 2834380009,
    comment: 'User with specific Transaction',
    numExpenses: 0,
    includeIncome: true,
    available: null,
    current: 1400,
    includeSpecificTransactions: true,
  });
}

async function down(phoneNumberSeed: string = '283') {
  const phone = `+1${phoneNumberSeed}4380000`;
  const firstTen = phone.substr(0, 10);

  await Promise.all([
    deleteUser(`${firstTen}01`),
    deleteUser(`${firstTen}02`),
    deleteUser(`${firstTen}03`),
    deleteUser(`${firstTen}04`),
    deleteUser(`${firstTen}05`),
    deleteUser(`${firstTen}06`),
    deleteUser(`${firstTen}07`),
    deleteUser(`${firstTen}08`),
    deleteUser(`${firstTen}09`),
  ]);
}

const getRandomExpenseOption = (merchantRatio: number): RandomExpenseOptions => {
  const randomName = Faker.random.words(2);
  if (Math.random() < merchantRatio) {
    const randomIndex = Math.floor(Math.random() * exampleExpenses.length);
    const templateMapping = exampleExpenses[randomIndex];
    return {
      name: `${templateMapping.name} ${randomName}`,
      merchantInfoId: null,
      category: templateMapping.category,
      subCategory: templateMapping.subCategory,
    };
  }
  return { name: randomName, merchantInfoId: 1, category: null, subCategory: null };
};

type Props = {
  phoneNumberSeed: string;
  budgetUserId: string;
  comment: string;
  numExpenses?: number;
  expensesFromDate?: string;
  expensesToDate?: string;
  includeIncome?: boolean;
  includeRecurringIncome?: boolean;
  includeRecurringExpenses?: boolean;
  available: number;
  current: number;
  merchantRatio?: number;
  expenseOptionList?: RandomExpenseOptions[];
  includeSpecificTransactions?: boolean;
};
const create = async ({
  phoneNumberSeed,
  budgetUserId,
  comment,
  numExpenses = 0,
  expensesFromDate = Faker.date.past(1).toString(),
  expensesToDate = moment().toString(),
  includeIncome = false,
  includeRecurringIncome = false,
  includeRecurringExpenses = false,
  available = 0,
  current = 0,
  merchantRatio = 0.5,
  expenseOptionList = null,
  includeSpecificTransactions = false,
}: Props) => {
  const phoneNumber = `+1${phoneNumberSeed}${PREFIX}${budgetUserId}`;
  const email = `dev-${phoneNumberSeed}${PREFIX}${budgetUserId}@dave.com`;
  const { synapsepayId, synapseNodeId } = getUniqueSynapseData(phoneNumber);

  const user = await createUser({
    email,
    phoneNumber,
    emailVerified: true,
    synapsepayId,
    firstName: 'Budgeting',
    lastName: comment,
    isSubscribed: true,
    skipSubscriptionBilling: true,
    settings: { doNotDisburse: true },
  });
  const userId = user.id;

  const bankConnection = await factory.create('bank-connection', {
    userId,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current,
    available,
    synapseNodeId,
  });
  const bankAccountId = bankAccount.id;

  await setDefaultBankAccount(userId, bankAccountId);
  await insertOnboardingSteps(userId);

  // random expenses:
  if (expenseOptionList) {
    for (const expense of expenseOptionList) {
      await insertExpense(
        userId,
        bankAccountId,
        expensesFromDate,
        expensesToDate,
        includeRecurringExpenses,
        expense,
      );
    }
  } else {
    // random expenses
    for (let i = 0; i < numExpenses; i++) {
      await insertExpense(
        userId,
        bankAccountId,
        expensesFromDate,
        expensesToDate,
        includeRecurringExpenses,
        getRandomExpenseOption(merchantRatio),
      );
    }
  }

  if (includeIncome) {
    await insertNormalIncomeTransactions(
      userId,
      bankAccountId,
      {
        name: 'Paycheck',
        amount: 500,
      },
      includeRecurringIncome,
    );
  }

  if (includeSpecificTransactions) {
    await insertNormalIncomeTransactions(userId, bankAccountId, {
      name: 'Automation Transaction',
      amount: -500,
      includeRecurringTransaction: true,
    });
  }
};

async function insertExpense(
  userId: number,
  bankAccountId: number,
  fromDate: string,
  toDate: string,
  includeRecurring: boolean,
  expense: RandomExpenseOptions,
) {
  const date = expense.date ?? Faker.date.between(fromDate, toDate);
  await insertRandomExpenseTransaction(userId, bankAccountId, {
    name: expense.name,
    includeRecurringTransaction: includeRecurring,
    date: moment(date),
    merchantInfoId: expense.merchantInfoId,
    category: expense.category,
    subCategory: expense.subCategory,
  });
}

const exampleExpenses: RandomExpenseOptions[] = [
  {
    name: 'P.O.S PURCHASE APPLE STOR APP',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
    merchantInfoId: null,
  },
  {
    name: 'POS Purchase Non-PIN APPLE COM BILL CUPERTINO CA',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
    merchantInfoId: null,
  },
  { name: 'Apple Market', category: 'Shops', subCategory: 'Discount Stores', merchantInfoId: null },
  {
    name: 'POS Debit Frys Electronics, APPLE VALLEY, CA',
    category: 'Shops',
    subCategory: 'Computers and Electronics',
    merchantInfoId: null,
  },
  {
    name: 'Point of Sale Debit DATE WAFFLE HOUSE DURHAM',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'Wetzel Pretzels Fox Hills',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'VISA DDA PUR WETZEL S PRETZELS MANCHESTER *',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'Point of Sale Debit TIME AM DATE SAM S CLUB WINSTON-SALNC',
    category: 'Shops',
    subCategory: 'Discount Stores',
    merchantInfoId: null,
  },
  {
    name: 'Purchase: IN N OUT BURG / ER WEST JORDAN Card:',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'IN N OUT BEER & WINE HALTOM CITY TX',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
    merchantInfoId: null,
  },
  { name: 'Circle K', category: 'Shops', subCategory: 'Convenience Stores', merchantInfoId: null },
  { name: 'POS Circle K', category: 'Travel', subCategory: 'Gas Stations', merchantInfoId: null },
  { name: 'Birchbox', category: 'Shops', subCategory: 'Beauty Products', merchantInfoId: null },
  {
    name: 'Point of Sale Debit DATE DOORDASH*BOJANGLESWWW DOORDASH',
    category: 'Service',
    subCategory: 'Food and Beverage',
    merchantInfoId: null,
  },
  {
    name: 'Debit Card Withdrawal: CHECKLINK BOJANGLES TN',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'SUPER CUTS-HOLLYWOOD HOLLYWOOD FL',
    category: 'Service',
    subCategory: 'Personal Care',
    merchantInfoId: null,
  },
  {
    name: 'TROPICAL SMOOTHIE CAF JENSEN BEACH FL',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'TROPICAL SMOOTH HERSHEY /PA US CARD PURCHASE',
    category: 'Shops',
    subCategory: 'Food and Beverage Store',
    merchantInfoId: null,
  },
  {
    name: 'External Withdrawal DISCOVER DC PYMNTS DCICMSPBP - PHONE PAY No Category',
    category: 'Payment',
    subCategory: 'Credit Card',
    merchantInfoId: null,
  },
  {
    name: 'Shake Shack',
    category: 'Service',
    subCategory: 'Food and Beverage',
    merchantInfoId: null,
  },
  {
    name: 'JFK SHAKESHACK JAMAICA NY',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: '24HR FITNESS#442',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
    merchantInfoId: null,
  },
  {
    name: 'ACH HOLD HOUR FITNESS DUES',
    category: 'Recreation',
    subCategory: 'Gyms and Fitness Centers',
    merchantInfoId: null,
  },
  {
    name: 'Hilton Hotels & Resorts',
    category: 'Travel',
    subCategory: 'Lodging',
    merchantInfoId: null,
  },
  {
    name: 'Hy-Vee',
    category: 'Shops',
    subCategory: 'Supermarkets and Groceries',
    merchantInfoId: null,
  },
  {
    name: 'DEBIT CARD : RAISING CANE S # PASADENA TX -',
    category: 'Service',
    subCategory: 'Food and Beverage',
    merchantInfoId: null,
  },
  {
    name: 'Smoothie King',
    category: 'Service',
    subCategory: 'Food and Beverage',
    merchantInfoId: null,
  },
  {
    name: 'smoothieking28',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  {
    name: 'Foreign Transaction Fee Citibank VN HCMC Ho Chi Minh',
    category: 'Bank Fees',
    subCategory: 'Foreign Transaction',
    merchantInfoId: null,
  },
  {
    name: 'AT&T UVERSE ONLINE PMT WEISS,VERNON',
    category: 'Service',
    subCategory: 'Cable',
    merchantInfoId: null,
  },
  {
    name: 'POS Debit - Visa Check Card ATT AUTH RETAIL ALEXANDRIA',
    category: 'Service',
    subCategory: 'Cable',
    merchantInfoId: null,
  },
  {
    name: 'TMOBILE*EIP PMT TEL WA',
    category: 'Service',
    subCategory: 'Telecommunication Services',
    merchantInfoId: null,
  },
  {
    name: 'VIRGIN&BOOST MOBILE PURCHASE',
    category: 'Service',
    subCategory: 'Telecommunication Services',
    merchantInfoId: null,
  },
  {
    name: 'ACH Transaction - AT T MOBILITY ONLINE PMT',
    category: 'Service',
    subCategory: 'Telecommunication Services',
    merchantInfoId: null,
  },
  {
    name: 'POINT OF SALE DEBIT / VESTA *T-MOBIL OR',
    category: 'Service',
    subCategory: 'Telecommunication Services',
    merchantInfoId: null,
  },
  { name: "Wendy's", category: 'Food and Drink', subCategory: 'Restaurants', merchantInfoId: null },
  {
    name: 'CHECK CARD PURCHASE WENDY S NORTH MIAMI BFL',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  { name: 'Liberty Mutual', category: 'Service', subCategory: 'Insurance', merchantInfoId: null },
  {
    name: 'CHECK/DEBIT / VSA RECUR PROGRESSIVE INS OH',
    category: 'Service',
    subCategory: 'Insurance',
    merchantInfoId: null,
  },
  {
    name: 'POS Debit - Visa Check Card PROGRESSIVE INSURA MAYFIELD VILLOHUS',
    category: 'Service',
    subCategory: 'Insurance',
    merchantInfoId: null,
  },
  {
    name: 'Point of Sale Debit DATE DisneyPLUS',
    category: 'Transfer',
    subCategory: 'Debit',
    merchantInfoId: null,
  },
  { name: 'Sbarro', category: 'Food and Drink', subCategory: 'Restaurants', merchantInfoId: null },
  { name: 'Groupon', category: 'Shops', subCategory: 'Digital Purchase', merchantInfoId: null },
  {
    name: 'FOREVER PURCHASE GLENWOOD AVE',
    category: 'Shops',
    subCategory: 'Clothing and Accessories',
    merchantInfoId: null,
  },
  { name: 'dave inc', category: 'Service', subCategory: 'Financial', merchantInfoId: null },
  { name: 'walmart', category: 'Shops', subCategory: 'Discount Stores', merchantInfoId: null },
  { name: 'shell', category: 'Travel', subCategory: 'Gas Stations', merchantInfoId: null },
  {
    name: 'starbucks',
    category: 'Food and Drink',
    subCategory: 'Restaurants',
    merchantInfoId: null,
  },
  { name: 'target', category: 'Shops', subCategory: 'Department Stores', merchantInfoId: null },
  { name: 'citgo', category: 'Travel', subCategory: 'Gas Stations', merchantInfoId: null },
  {
    name: 'safeway',
    category: 'Shops',
    subCategory: 'Supermarkets and Groceries',
    merchantInfoId: null,
  },
  { name: 'spotify', category: 'Service', subCategory: 'Subscription', merchantInfoId: null },
  {
    name: 'trader joe',
    category: 'Shops',
    subCategory: 'Supermarkets and Groceries',
    merchantInfoId: null,
  },
  {
    name: 'cinemark theatres',
    category: 'Recreation',
    subCategory: 'Arts and Entertainment',
    merchantInfoId: null,
  },
  { name: 'michaels', category: 'Shops', subCategory: 'Arts and Crafts', merchantInfoId: null },
  { name: 'lowes', category: 'Shops', subCategory: 'Hardware Store', merchantInfoId: null },
  { name: 'wells fargo', category: 'Bank Fees', subCategory: 'Overdraft', merchantInfoId: null },
  {
    name: 'ikea',
    category: 'Shops',
    subCategory: 'Furniture and Home Decor',
    merchantInfoId: null,
  },
  { name: 'amazon', category: 'Shops', subCategory: 'Digital Purchase', merchantInfoId: null },
  {
    name: 'goodwill',
    category: 'Community',
    subCategory: 'Organizations and Associations',
    merchantInfoId: null,
  },
];

export { up, down };
