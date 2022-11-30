import { moment } from '@dave-inc/time-lib';
import {
  BankingDataSource,
  DonationOrganizationCode,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import * as changeCase from 'change-case';
import * as Faker from 'faker';
import { Moment } from 'moment';
import UserHelper from '../../src/helper/user';
import BankingDataClient from '../../src/lib/heath-client';
import { ACTIVE_TIMESTAMP } from '../../src/lib/sequelize';
import { BankAccount, InternalUser, sequelize, User } from '../../src/models';
import { BalanceLogCaller, RecurringTransactionStatus } from '../../src/typings';
import { BankTransactionCreate } from '@dave-inc/heath-client';
import factory from '../../test/factories';

const DefaultPassword: string = 'Password1!';

/**
 * Creates common auxillary rows along with each user.
 */
export async function createUser(props: { [key: string]: any } = {}) {
  if (!props.email) {
    props.email = 'dev@dave.com';
  }
  if (!props.deleted) {
    props.deleted = ACTIVE_TIMESTAMP;
  }
  const user = await factory.create<User>('user', props, {
    hasEmailVerification: true,
    hasSession: true,
  });

  if (!props.hasNoPassword) {
    await user.setPassword(DefaultPassword);
    await user.save();

    if (!props.requireMFA) {
      await UserHelper.setAdminLoginOverride(user.phoneNumber, {
        ttl: 3600,
        password: DefaultPassword,
      });
    }
  }

  const startOfMonth = moment().startOf('month');
  if (!props.skipSubscriptionBilling) {
    await factory.create('subscription-billing', {
      userId: user.id,
      amount: 1,
      billingCycle: startOfMonth.format('YYYY-MM'),
      dueDate: startOfMonth.clone().add(3, 'day'),
      start: startOfMonth,
      created: startOfMonth,
      end: startOfMonth.clone().endOf('month'),
    });
  }

  return user;
}

export async function createInternalUser(email?: string) {
  const emailToUse = email || `internal-user-${Faker.random.alphaNumeric(24)}@dave.com`;

  const [internalUser] = await InternalUser.findCreateFind({ where: { email: emailToUse } });

  return internalUser;
}

export async function insert(table: string, obj: any) {
  const keys: string[] = [];
  const values: any[] = [];
  Object.keys(obj).forEach(key => {
    keys.push('`' + changeCase.snakeCase(key) + '`');
    values.push(obj[key]);
  });
  const ok = await sequelize.query(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${values.map(a => '?').join(',')});`,
    { replacements: values },
  );
  return ok[0];
}

export const onboardingSteps = [
  'SelectAccount',
  'AddDebitCard',
  'AddEmailAndPasswordOnboarding',
  'SetAlert',
  'CreditScore',
  'Expense',
  'TargetSpend',
  'Income',
];

export async function insertOnboardingSteps(userId: number) {
  for (const step of onboardingSteps) {
    await insert('onboarding_step', { userId, step });
  }
}

export async function insertNormalIncomeTransactions(
  userId: number,
  bankAccountId: number,
  {
    name = '',
    amount = 800,
    date = null,
    status = RecurringTransactionStatus.VALID,
    missed = null,
    period = 'BIWEEKLY',
  }: any,
  includeRecurringTransaction = false,
): Promise<{ recurringTransactionId: number | null }> {
  const txnName = name || Faker.name.jobDescriptor();
  const txnAmount = amount;
  const txnDate = date ? moment(date) : moment().add(5, 'days');
  let date1 = moment(txnDate).subtract(6, 'weeks');
  let date2 = moment(txnDate).subtract(4, 'weeks');
  let date3 = moment(txnDate).subtract(2, 'weeks');
  let params = `["${txnDate.format('dddd').toLowerCase()}"]`;
  if (period === 'MONTHLY') {
    date1 = moment(txnDate).subtract(3, 'months');
    date2 = moment(txnDate).subtract(2, 'months');
    date3 = moment(txnDate).subtract(1, 'months');
    if (txnDate.date() > 28) {
      params = '[-1]';
    } else {
      params = `[${txnDate.format('D')}]`;
    }
  } else if (period === 'WEEKLY') {
    date1 = moment(txnDate).subtract(3, 'weeks');
    date2 = moment(txnDate).subtract(2, 'weeks');
    date3 = moment(txnDate).subtract(1, 'weeks');
  }

  const promises: Array<Promise<any>> = [
    BankingDataClient.createBankTransactions([
      {
        userId,
        bankAccountId,
        externalName: txnName,
        displayName: txnName,
        externalId: Faker.random.alphaNumeric(24),
        amount: txnAmount,
        transactionDate: date1.format('YYYY-MM-DD'),
        pending: false,
      },
      {
        userId,
        bankAccountId,
        externalName: txnName,
        displayName: txnName,
        externalId: Faker.random.alphaNumeric(24),
        amount: txnAmount,
        transactionDate: date2.format('YYYY-MM-DD'),
        pending: false,
      },
      {
        userId,
        bankAccountId,
        externalName: txnName,
        displayName: txnName,
        externalId: Faker.random.alphaNumeric(24),
        amount: txnAmount,
        transactionDate: date3.format('YYYY-MM-DD'),
        pending: false,
      },
    ] as BankTransactionCreate[]),
  ];

  let rTxnId = null;
  if (includeRecurringTransaction) {
    promises.push(
      insert('recurring_transaction', {
        userId,
        bankAccountId,
        transactionDisplayName: txnName,
        '`interval`': period.toLowerCase(),
        params,
        dtstart: txnDate
          .clone()
          .subtract(2, 'days')
          .format('YYYY-MM-DD'),
        userDisplayName: txnName,
        userAmount: txnAmount,
        status,
        missed,
      }).then(resId => (rTxnId = resId)),
    );
    promises.push(
      insert('expected_transaction', {
        userId,
        bankAccountId,
        pendingDisplayName: txnName,
        displayName: txnName,
        expectedDate: txnDate.format('YYYY-MM-DD'),
        expectedAmount: txnAmount,
        status: 'PREDICTED',
        recurringTransactionId: rTxnId,
      }),
    );
  }

  await Promise.all(promises);

  return {
    recurringTransactionId: rTxnId,
  };
}

export async function insertSixtyDaysHistory(userId: number, bankAccountId: number) {
  const txnName = Faker.company.bsNoun() + moment().valueOf();
  const txnAmount = -50;
  const txnDate = moment().subtract(65, 'days');
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate.format('YYYY-MM-DD'),
      pending: false,
    },
  ] as BankTransactionCreate[]);
}

/**
 * Required to avoid the call to the prediction api.
 */
export async function insertFirstAdvance(
  userId: number,
  bankAccountId: number,
  paymentMethodId: number,
  isPaidOff: boolean = false,
  amount: number = 75,
  created: Moment = moment(),
  paidBack: Moment = moment().add(3, 'days'),
  fee: number = 5.0,
  tip: number = 3.75,
  tipPercent: number = 5,
) {
  const advanceId = await insert('advance', {
    userId,
    bankAccountId,
    paymentMethodId,
    paybackFrozen: false,
    amount,
    fee,
    outstanding: isPaidOff ? 0 : amount + fee + tip,
    disbursementStatus: `COMPLETED`,
    paybackDate: moment(paidBack).format(`YYYY-MM-DD`),
    disbursementProcessor: `RISEPAY`,
    created: moment(created).format(`YYYY-MM-DD`),
    updated: moment(created).format(`YYYY-MM-DD`),
    collectionInProgress: !isPaidOff,
    createdDate: moment(created).format(`YYYY-MM-DD`),
  });

  await factory.create('advance-tip', {
    advanceId,
    donationOrganization: DonationOrganizationCode.TREES,
    amount: tip,
    percent: tipPercent,
  });

  return advanceId;
}

/**
 * Adds a daily balance log of $1050 in the last week to qualify for $75 in the available balance node
 *
 * @param {BankAccount} bankAccount
 * @returns {Promise<void>}
 */
export async function upsertDailyBalanceLogToQualifyFor75(
  bankAccount: BankAccount,
  date: Moment = moment().subtract(8, 'day'),
): Promise<void> {
  await BankingDataClient.saveBalanceLogs({
    userId: bankAccount.userId,
    bankAccountId: bankAccount.id,
    bankConnectionId: bankAccount.bankConnectionId,
    processorAccountId: bankAccount.externalId,
    processorName: BankingDataSource.Plaid,
    current: 1250,
    available: 1250,
    date: date.format(),
    caller: BalanceLogCaller.BinDevSeed,
  });
}

export async function insertRandomExpenseTransactions(userId: number, bankAccountId: number) {
  const promises: Array<Promise<any>> = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      insertRandomExpenseTransaction(userId, bankAccountId, {
        date: moment().subtract((100 - i) * 2, 'days'),
        pending: i < 6 && i % 3 === 0,
      }),
    );
  }
  return Promise.all(promises);
}

export type RandomExpenseOptions = {
  name?: string;
  amount?: number;
  pending?: boolean;
  date?: Moment;
  merchantInfoId?: number;
  includeRecurringTransaction?: boolean;
  interval?: string;
  params?: number[];
  category?: string;
  subCategory?: string;
};
export async function insertRandomExpenseTransaction(
  userId: number,
  bankAccountId: number,
  {
    name = `Random Transaction ${Math.floor(Math.random() * 10000000000)}`,
    amount = -476 * Math.random() - 1,
    date = moment(),
    pending = false,
    merchantInfoId = 1,
    includeRecurringTransaction = false,
    interval = 'monthly',
    params = [-1],
    category = null,
    subCategory = null,
  }: RandomExpenseOptions = {},
): Promise<void> {
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: name,
      displayName: name,
      externalId: Faker.random.alphaNumeric(24),
      amount,
      transactionDate: date.format('YYYY-MM-DD'),
      pending,
      merchantInfoId,
      plaidCategory: getPlaidCategory(category, subCategory),
    } as BankTransactionCreate,
  ]);

  if (includeRecurringTransaction) {
    await factory.create('recurring-transaction', {
      bankAccountId,
      userId,
      transactionDisplayName: name,
      userDisplayName: name,
      userAmount: amount,
      interval,
      params,
      dtstart: date
        .clone()
        .subtract(2, 'days')
        .format('YYYY-MM-DD'),
    });
  }
}

function getPlaidCategory(category: string, subCategory: string) {
  if (category && subCategory) {
    return [category, subCategory];
  } else if (category) {
    return [category];
  }
  return null;
}

export async function insertSubscriptionHistory(
  userId: number,
  bankAccountId: number,
  paymentMethodId: number,
) {
  const amount = 1;
  const statusKeys: string[] = ['Pending', 'Unknown', 'Completed', 'Returned', 'Canceled'];
  statusKeys.sort();
  // Next billing.

  await factory.create('subscription-billing', { amount, dueDate: moment().add(5, 'day'), userId });
  // Previous billings with various fulfillments.
  const thisMonth = moment().startOf('month');
  for (let i = 1; i < 10; i++) {
    const month = thisMonth.clone().subtract(i, 'month');
    // @ts-ignore
    const status = ExternalTransactionStatus[statusKeys[i % statusKeys.length] as any];
    const bankAccountIdI = i % 2 === 1 ? bankAccountId : null;
    const paymentMethodIdI = i % 2 === 0 ? paymentMethodId : null;
    await insertSubscriptionEntry(userId, month, status, amount, bankAccountIdI, paymentMethodIdI);
  }

  // Extra billing to test multiple on returned month.
  const { billing: multipleBilling } = await insertSubscriptionEntry(
    userId,
    thisMonth.clone().subtract(10, 'month'),
    ExternalTransactionStatus.Returned, // The "first" attempt to pay.
    amount,
    bankAccountId,
    paymentMethodId,
  );
  const secondPayment = await factory.create('subscription-payment', {
    amount,
    bankAccountId,
    paymentMethodId,
    status: ExternalTransactionStatus.Completed, // The "second" attempt to pay.
    userId,
    created: moment().add(1, 'hour'), // Must be later than the other payment.
  });
  await factory.create('subscription-payment-line-item', {
    subscriptionBillingId: multipleBilling.id,
    subscriptionPaymentId: secondPayment.id,
  });
}

export async function insertSubscriptionEntry(
  userId: number,
  month: Moment,
  status: ExternalTransactionStatus | string, // Since we're not referring to statically above.
  amount: number,
  bankAccountId: number = null,
  paymentMethodId: number = null,
) {
  const billing = await factory.create('subscription-billing', {
    amount,
    billingCycle: month.format('YYYY-MM'),
    dueDate: month
      .clone()
      .add(5, 'day')
      .format('YYYY-MM-DD'),
    end: month.clone().endOf('month'),
    start: month,
    userId,
  });
  const payment = await factory.create('subscription-payment', {
    amount,
    bankAccountId,
    paymentMethodId,
    status,
    userId,
  });
  const lineItem = await factory.create('subscription-payment-line-item', {
    subscriptionBillingId: billing.id,
    subscriptionPaymentId: payment.id,
  });
  return { billing, payment, lineItem };
}

export const setDefaultBankAccount = (userId: number, bankAccountId: number) => {
  return sequelize.query(
    `
        UPDATE user
        SET default_bank_account_id = ?
        WHERE id = ?
    `,
    { replacements: [bankAccountId, userId] },
  );
};

export const getUniqueSynapseData = (phoneNumber: string) => {
  const phone = phoneNumber.replace(/\+/, '');
  const synapsepayId = Faker.random.alphaNumeric(20) + phone;
  const synapsepayDocId = Faker.random.alphaNumeric(22) + phone;
  const synapseNodeId = Faker.random.alphaNumeric(24) + phone;
  return { synapsepayId, synapsepayDocId, synapseNodeId };
};
