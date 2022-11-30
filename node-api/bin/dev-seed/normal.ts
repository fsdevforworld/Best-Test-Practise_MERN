import * as Bluebird from 'bluebird';
import * as Faker from 'faker';
import { Moment } from 'moment';
import { DateOnly, moment } from '@dave-inc/time-lib';
import { sequelize } from '../../src/models';
import { Op, QueryTypes } from 'sequelize';
import { monthlyParam } from '../../src/domain/recurring-transaction/detect-recurring-schedule';
import { BalanceLogCaller } from '../../src/typings';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import {
  createUser,
  insert,
  insertFirstAdvance,
  insertOnboardingSteps,
  insertSubscriptionHistory,
} from './utils';
import {
  Institution,
  Role,
  SideHustleJob,
  SideHustleProvider,
  SideHustleCategory,
  UserSettingName,
} from '../../src/models';
import factory from '../../test/factories';
import { bankOfAmericaLogo, bankOfDaveLogo, chaseLogo, wellsFargoLogo } from './institution-logo';
import { deleteUser } from './delete-user';
import { BankingDataSource, UserRole } from '@dave-inc/wire-typings';
import BankingDataClient from '../../src/lib/heath-client';
import { BankTransactionCreate } from '@dave-inc/heath-client';

let phoneNumSeed: string;

export async function up(phoneNumberSeed: string = '123') {
  const now = moment();
  let firstRTxnId: number;
  let rTxnId: number;
  let txnAmount: number;
  let txnDate: Moment;
  let txnName: string;
  phoneNumSeed = phoneNumberSeed;

  const synapsepayId = Faker.random.alphaNumeric(24);
  const synapseNodeId = Faker.random.alphaNumeric(24);
  const duplicateRisepayCustomerId = `${Faker.random.alphaNumeric(8)}-11BB-11CC-11Dd-111111111111`;

  const email = `dev-${phoneNumberSeed}@dave.com`;
  const user = await createUser({
    email,
    emailVerified: true,
    synapsepayId,
    phoneNumber: `+1${phoneNumberSeed}4567890`,
    firstName: 'Dave',
    lastName: 'DaBear',
    birthdate: '1990-01-01',
    addressLine1: '1265 S Cochran Ave',
    addressLine2: 'The Pit',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
    isSubscribed: true,
    subscriptionStart: moment().format('YYYY-MM-DD'),
    settings: { targetSpend: 1000, doNotDisburse: true },
    skipSubscriptionBilling: true,
  });
  const roles = await Role.findAll({
    where: {
      name: {
        [Op.or]: [UserRole.tester],
      },
    },
  });
  user.setRoles(roles);
  await user.save();
  const userId = user.id;

  await factory.create('user-session', {
    userId,
    token: 'admin',
    deviceId: 'admin',
    deviceType: 'admin_web',
  });

  //console.log('Adding dev duplicate user...');
  await createUser({
    email: `deleted-dev-${phoneNumberSeed}@dave.com`,
    phoneNumber: `+1${phoneNumberSeed}3333322`,
    firstName: 'Dave',
    lastName: 'DaDuplicatedBear',
    birthdate: '1990-03-03',
    addressLine1: '123 Duplicated Ave',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
    deleted: '2018-03-22 20:16:58',
    isSubscribed: false,
    risepayCustomerId: duplicateRisepayCustomerId,
    settings: { targetSpend: 1000, doNotDisburse: true },
    emailVerified: false,
  });

  //console.log('Adding dev user email verification row...');
  await insert('email_verification', { userId, email });

  const localeUserSetting = await UserSettingName.findAll({
    where: {
      name: 'locale',
    },
  });

  if (localeUserSetting.length === 0) {
    await insert('user_setting_name', { name: 'locale' });
  }

  //console.log('Adding dev user identify verification row...');
  await factory.create('synapsepay-document', {
    userId,
    synapsepayUserId: Faker.random.alphaNumeric(24),
    userNotified: 1,
    email,
    day: '1',
    month: '1',
    year: '1',
    addressStreet: 'Gummy Bear Lane',
    addressCity: 'Care Bear City',
    addressPostalCode: "('o')",
    permission: 'SEND-AND-RECEIVE',
    ip: '1.2.3.4',
    phoneNumber: `+1${phoneNumberSeed}4567890`,
    ssnStatus: 'VALID',
    ssn: '123-45-6789',
    licenseStatus: 'VALID',
    name: 'Bob Youhadababyitsaboy',
    synapsepayDocId: Faker.random.alphaNumeric(24),
  });

  let institutionId;

  const majorInstitutions = await Institution.findAll({
    where: {
      [Op.or]: [
        { plaidInstitutionId: 'ins_3' },
        { plaidInstitutionId: 'wells' },
        { plaidInstitutionId: 'simple' },
      ],
    },
  });

  if (majorInstitutions.length === 0) {
    //console.log('Adding dev institution...');
    const [insertId] = await sequelize.query(
      `INSERT into institution (id,
                                display_name,
                                plaid_institution_id,
                                primary_color,
                                username_label,
                                password_label,
                                balance_includes_pending,
                                logo)
       VALUES (DEFAULT, 'Chase', 'ins_3', '#0000FF', 'Username', 'Password', false, ?),
              (DEFAULT, 'Wells', 'wells', '#FF0000', 'Username', 'Password', false, ?),
              (DEFAULT, 'Simple', 'simple', '#00FF00', 'Username', 'Password', true, ?)
    `,
      {
        replacements: [chaseLogo, wellsFargoLogo, bankOfAmericaLogo, bankOfDaveLogo],
        type: QueryTypes.INSERT,
      },
    );
    institutionId = insertId;
  } else if (majorInstitutions.length >= 1) {
    institutionId = majorInstitutions[0].id;
  }

  //console.log('Adding dev bank connection...');
  const bankConnection = await factory.create('bank-connection', {
    userId,
    institutionId,
    externalId: Faker.random.alphaNumeric(24),
    authToken: Faker.random.alphaNumeric(24),
    hasValidCredentials: true,
    hasTransactions: true,
    initialPull: now.format('YYYY-MM-DD'),
    historicalPull: now.format('YYYY-MM-DD'),
    lastPull: now.format('YYYY-MM-DD'),
    created: now.format('YYYY-MM-DD HH:mm:ss'),
  });
  const bankConnectionId = bankConnection.id;

  const bankConnectionDeletedOne = await factory.create('bank-connection', {
    deleted: '2018-03-20 10:30:58',
    userId,
    institutionId,
    externalId: Faker.random.alphaNumeric(24),
    authToken: Faker.random.alphaNumeric(24),
    hasValidCredentials: true,
    hasTransactions: true,
    initialPull: now.format('YYYY-MM-DD'),
    historicalPull: now.format('YYYY-MM-DD'),
    lastPull: now.format('YYYY-MM-DD'),
    created: now.format('YYYY-MM-DD HH:mm:ss'),
  });
  const bankConnectionIdDeletedOne = bankConnectionDeletedOne.id;
  //console.log('Adding dev bank accounts...');
  const bankAccount = await factory.create('bank-account', {
    userId,
    institutionId,
    bankConnectionId,
    synapseNodeId,
    externalId: Faker.random.alphaNumeric(24),
    displayName: 'Bank Account Dev',
    current: 300,
    available: 300,
    type: 'depository',
    subtype: 'checking',
    accountNumber: '001|001',
    accountNumberAes256: '001|001',
    lastFour: '1111',
    preApprovalWaitlist: new Date(),
  });
  const bankAccountId = bankAccount.id;
  await factory.create('bank-account', {
    userId,
    institutionId,
    bankConnectionId,
    synapseNodeId: Faker.random.alphaNumeric(24),
    externalId: Faker.random.alphaNumeric(24),
    displayName: 'Second Bank Account Dev',
    current: 0,
    available: 0,
    type: 'depository',
    subtype: 'checking',
    accountNumber: '002|002',
    accountNumberAes256: '002|002',
    lastFour: '2222',
  });

  //console.log('Adding dev deleted bank accounts...');
  const bcaDeleted = await factory.create('bank-account', {
    deleted: '2018-03-20 10:30:58',
    userId,
    institutionId,
    bankConnectionId: bankConnectionIdDeletedOne,
    externalId: Faker.random.alphaNumeric(24),
    displayName: 'Bank Account Dev Deleted One',
    current: 100,
    available: 100,
    type: 'depository',
    subtype: 'checking',
    accountNumber: '111|111',
    accountNumberAes256: '111|111',
    lastFour: '0001',
  });

  const paymentMethod = await factory.create('payment-method', {
    userId,
    bankAccountId,
    availability: 'immediate',
    mask: '1111',
    displayName: 'Chase Debit: 1111',
    expiration: '2020-01-01',
    scheme: 'visa',
  });
  const paymentMethodId = paymentMethod.id;

  await factory.create('payment-method', {
    deleted: '2018-03-20 10:30:58',
    userId,
    bankAccountId: bcaDeleted.id,
    availability: 'immediate',
    mask: '0001',
    displayName: 'Chase Debit: 0001',
    expiration: '2020-01-01',
    scheme: 'visa',
  });

  //console.log('Adding dev subscription payment history...');
  await factory.create('subscription-payment', {
    userId,
    bankAccountId,
    amount: 1.0,
    externalProcessor: 'RISEPAY',
    externalId: Faker.random.alphaNumeric(24),
    status: 'PENDING',
    created: '2018-02-10 11:00:00',
    updated: '2018-02-10 11:00:00',
  });

  await factory.create('subscription-payment', {
    userId,
    bankAccountId,
    amount: 1.0,
    externalProcessor: 'RISEPAY',
    externalId: Faker.random.alphaNumeric(24),
    status: 'COMPLETED',
    created: '2018-03-16 14:30:00',
    updated: '2018-03-16 14:30:00',
  });

  //console.log('Declaring dev user default bank account...');
  await sequelize.query(
    `
        UPDATE user
        SET default_bank_account_id = ?
        WHERE id = ?
    `,
    { replacements: [bankAccountId, userId] },
  );

  //console.log('Adding onboarding steps for dev user...');
  await insertOnboardingSteps(userId);

  //console.log('Adding dev bank/recurring transactions/predictions...');
  txnName = 'All the Honey';
  txnAmount = 500;
  txnDate = now.clone().add(5, 'days');
  if (txnDate.day() === 6 || txnDate.day() === 0) {
    txnDate.add(2, 'days');
  }
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate
        .clone()
        .subtract(6, 'weeks')
        .format('YYYY-MM-DD'),
      pending: false,
    },
  ]);
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate
        .clone()
        .subtract(4, 'weeks')
        .format('YYYY-MM-DD'),
      pending: false,
    },
  ]);
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate
        .clone()
        .subtract(2, 'weeks')
        .format('YYYY-MM-DD'),
      pending: false,
    },
  ]);
  let recurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId,
    userId,
    transactionDisplayName: txnName,
    interval: 'biweekly',
    params: [`${txnDate.format('dddd').toLowerCase()}`],
    dtstart: txnDate.subtract(2, 'days').format('YYYY-MM-DD'),
    userDisplayName: txnName,
    userAmount: txnAmount,
  });
  firstRTxnId = rTxnId = recurringTransaction.id;

  await factory.create('expected-transaction', {
    userId,
    bankAccountId,
    pendingDisplayName: txnName,
    displayName: txnName,
    type: 'INCOME',
    expectedDate: txnDate.format('YYYY-MM-DD'),
    expectedAmount: txnAmount,
    status: 'PREDICTED',
    recurringTransactionId: rTxnId,
  });
  txnName = 'Some of the Honey';
  txnAmount = 250;
  txnDate = now.clone().subtract(6, 'days');
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
  ]);
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate
        .clone()
        .subtract(1, 'month')
        .format('YYYY-MM-DD'),
      pending: false,
    },
  ]);
  txnName = 'Banana Cabana Membership Dues';
  txnAmount = -5;
  txnDate = now.clone().subtract(16, 'days');
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
  ]);
  recurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId,
    userId,
    transactionDisplayName: txnName,
    interval: 'monthly',
    dtstart: txnDate.subtract(2, 'days').format('YYYY-MM-DD'),
    params: monthlyParam(DateOnly.fromMoment(txnDate)),
    userDisplayName: txnName,
    userAmount: txnAmount,
  });
  rTxnId = recurringTransaction.id;
  await factory.create('expected-transaction', {
    userId,
    bankAccountId,
    pendingDisplayName: txnName,
    displayName: txnName,
    type: 'EXPENSE',
    expectedDate: txnDate.format('YYYY-MM-DD'),
    expectedAmount: txnAmount,
    status: 'PREDICTED',
    recurringTransactionId: rTxnId,
  });
  txnName = 'Bassoon Lessons';
  txnAmount = -50;
  txnDate = now.clone();
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
  ]);
  recurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId,
    userId,
    transactionDisplayName: txnName,
    interval: 'monthly',
    params: monthlyParam(DateOnly.fromMoment(txnDate)),
    dtstart: txnDate.subtract(2, 'days').format('YYYY-MM-DD'),
    userDisplayName: txnName,
    userAmount: txnAmount,
  });
  rTxnId = recurringTransaction.id;

  await factory.create('expected-transaction', {
    userId,
    bankAccountId,
    pendingDisplayName: txnName,
    displayName: txnName,
    type: 'EXPENSE',
    expectedDate: txnDate.format('YYYY-MM-DD'),
    expectedAmount: txnAmount,
    status: 'PREDICTED',
    recurringTransactionId: rTxnId,
  });
  txnName = 'Jazz Hands Rehearsal';
  txnAmount = -78.99;
  txnDate = now.clone().subtract(3, 'days');
  recurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId,
    userId,
    transactionDisplayName: txnName,
    interval: 'monthly',
    dtstart: txnDate.subtract(2, 'days').format('YYYY-MM-DD'),
    params: monthlyParam(DateOnly.fromMoment(txnDate)),
    userDisplayName: txnName,
    userAmount: txnAmount,
  });
  rTxnId = recurringTransaction.id;

  await factory.create('expected-transaction', {
    userId,
    bankAccountId,
    pendingDisplayName: txnName,
    displayName: txnName,
    type: 'EXPENSE',
    expectedDate: txnDate.format('YYYY-MM-DD'),
    expectedAmount: txnAmount,
    status: 'PREDICTED',
    recurringTransactionId: rTxnId,
  });
  txnName = 'Pokémon Card Tournament Entry Fee';
  txnAmount = -200;
  txnDate = now.clone().add(3, 'days');
  await BankingDataClient.createBankTransactions([
    {
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: txnAmount,
      transactionDate: txnDate
        .clone()
        .subtract(1, 'month')
        .format('YYYY-MM-DD'),
      pending: false,
    },
  ]);
  recurringTransaction = await factory.create('recurring-transaction', {
    bankAccountId,
    userId,
    transactionDisplayName: txnName,
    interval: 'monthly',
    dtstart: txnDate.subtract(2, 'days').format('YYYY-MM-DD'),
    params: monthlyParam(DateOnly.fromMoment(txnDate)),
    userDisplayName: txnName,
    userAmount: txnAmount,
  });
  rTxnId = recurringTransaction.id;

  await factory.create('expected-transaction', {
    userId,
    bankAccountId,
    pendingDisplayName: txnName,
    displayName: txnName,
    type: 'EXPENSE',
    expectedDate: txnDate.format('YYYY-MM-DD'),
    expectedAmount: txnAmount,
    status: 'PREDICTED',
    recurringTransactionId: rTxnId,
  });
  const transactions: BankTransactionCreate[] = [];
  for (let i = 0; i < 100; i++) {
    txnName = `Random Transaction ${i + 1}`;
    transactions.push({
      userId,
      bankAccountId,
      externalName: txnName,
      displayName: txnName,
      externalId: Faker.random.alphaNumeric(24),
      amount: -4.76 * i,
      transactionDate: now
        .clone()
        .subtract((100 - i) * 2, 'days')
        .format('YYYY-MM-DD'),
      pending: i < 6 && i % 3 === 0,
    });
  }
  await BankingDataClient.createBankTransactions(transactions);

  await Bluebird.all([
    insertSubscriptionHistory(userId, bankAccountId, paymentMethodId),
    insertFirstAdvance(userId, bankAccountId, paymentMethodId, false),
    BankingDataSync.backfillDailyBalances(
      bankAccount,
      BalanceLogCaller.BinDevSeed,
      BankingDataSource.Plaid,
    ),
    sequelize.query(
      `
            UPDATE bank_account
            SET main_paycheck_recurring_transaction_id = ?
            WHERE id = ?
        `,
      { replacements: [firstRTxnId, bankAccountId] },
    ),
    createDeletedUser(institutionId),
  ]);

  const [daveProvider] = await SideHustleProvider.findOrCreate({
    where: { name: 'Dave' },
    defaults: { isDaveAuthority: true },
  });
  const [sideHustleCategory] = await SideHustleCategory.findOrCreate({
    where: { name: 'Accounting' },
    defaults: { priority: 10 },
  });

  const [airbnb] = await SideHustleJob.findOrCreate({
    where: {
      company: 'Airbnb',
    },
    defaults: {
      tagline: 'foo bar',
      name: 'Airbnb',
      externalId: 'airbnb',
      sideHustleProviderId: daveProvider.id,
      sideHustleCategoryId: sideHustleCategory.id,
    },
  });
  await factory.create('side-hustle-application', {
    userId,
    sideHustleJobId: airbnb.id,
    status: 'CONTACTED',
  });

  const authorizedEmpyrEvent = await factory.create('empyr-event-authorized', {
    userId,
    created: moment().subtract(2, 'days'),
    transactionDate: moment().subtract(2, 'days'),
    processedDate: moment().subtract(2, 'days'),
    authorizedAmount: 19.99,
    rewardAmount: 1.99,
    venueName: 'Bistro Burger',
    venueThumbnailUrl:
      'https://d10ukqbetc2okm.cloudfront.net/images/business/3870/bistro-burger1867933466-thumb.jpg',
  });

  await factory.create('empyr-event-cleared', {
    userId,
    transactionId: authorizedEmpyrEvent.transactionId,
    created: moment().subtract(1, 'days'),
    transactionDate: moment().subtract(1, 'days'),
    processedDate: moment().subtract(1, 'days'),
    authorizedAmount: authorizedEmpyrEvent.authorizedAmount,
    clearedAmount: authorizedEmpyrEvent.authorizedAmount,
    rewardAmount: authorizedEmpyrEvent.rewardAmount,
    venueName: authorizedEmpyrEvent.venueName,
    venueThumbnailUrl: authorizedEmpyrEvent.venueThumbnailUrl,
  });

  await factory.create('empyr-event-authorized', {
    userId,
    created: moment(),
    transactionDate: moment(),
    processedDate: moment(),
    authorizedAmount: 10.28,
    rewardAmount: 1.28,
    venueName: 'Green Papaya',
    venueThumbnailUrl:
      'https://d10ukqbetc2okm.cloudfront.net/images/business/3598/green-papaya1869866052-thumb.jpg',
  });

  await factory.create('empyr-event-removed', {
    userId,
    created: moment().subtract(1, 'days'),
    transactionDate: moment().subtract(1, 'days'),
    processedDate: moment().subtract(1, 'days'),
    authorizedAmount: 5.25,
    clearedAmount: 5.25,
    rewardAmount: 0.0,
    venueName: 'Union Square Sports Bar',
    venueThumbnailUrl:
      'https://d10ukqbetc2okm.cloudfront.net/images/business/2143/union-square-sports-bar816824028-thumb.jpg',
  });

  await factory.create('empyr-event-removed-dup', {
    userId,
    created: moment().subtract(3, 'days'),
    transactionDate: moment().subtract(3, 'days'),
    processedDate: moment().subtract(3, 'days'),
    authorizedAmount: 100.01,
    clearedAmount: 100.01,
    rewardAmount: 0.0,
    venueName: 'Bamboo Asia',
    venueThumbnailUrl:
      'https://d10ukqbetc2okm.cloudfront.net/images/business/1784/bamboo-asia178655098-thumb.jpg',
  });
}

export async function down(phoneNumberSeed: string = '123') {
  await deleteUser(`+1${phoneNumberSeed}4567890`);
  await deleteUser(`+1${phoneNumberSeed}3333322`);
  await deleteUser(`+1${phoneNumberSeed}2222222-deleted`);
}

export async function createDeletedUser(institutionId: number) {
  const duplicateRisepayCustomerId = `${Faker.random.alphaNumeric(8)}-11BB-11CC-11Dd-111111111111`;
  const now = moment();
  const deletedUser = await createUser({
    email: `deleted-dev2-${phoneNumSeed}@dave.com`,
    phoneNumber: `+1${phoneNumSeed}2222222-deleted`,
    firstName: 'Dave',
    lastName: 'DaDeletedBear',
    birthdate: '1992-02-02',
    addressLine1: '123 Deleted Ave',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90019',
    deleted: '2018-03-19 20:16:58',
    isSubscribed: false,
    emailVerified: false,
    settings: { targetSpend: 1000, doNotDisburse: true },
  });
  const userIdDeleted = deletedUser.id;
  const bankConnectionDeletedTwo = await factory.create('bank-connection', {
    deleted: '2018-03-21 09:30:00',
    userId: userIdDeleted,
    institutionId,
    externalId: Faker.random.alphaNumeric(24),
    authToken: Faker.random.alphaNumeric(24),
    hasValidCredentials: true,
    hasTransactions: true,
    initialPull: now.format('YYYY-MM-DD'),
    historicalPull: now.format('YYYY-MM-DD'),
    lastPull: now.format('YYYY-MM-DD'),
    created: now.format('YYYY-MM-DD HH:mm:ss'),
  });
  const bankConnectionIdDeletedTwo = bankConnectionDeletedTwo.id;
  const bcaDeleted = await factory.create('bank-account', {
    deleted: '2018-03-20 10:30:58',
    userId: userIdDeleted,
    institutionId,
    bankConnectionId: bankConnectionIdDeletedTwo,
    externalId: Faker.random.alphaNumeric(24),
    displayName: 'Bank Account Dev Deleted Two',
    current: 100,
    available: 100,
    type: 'depository',
    subtype: 'checking',
    accountNumber: '111|111',
    accountNumberAes256: '111|111',
    lastFour: '0001',
  });
  await Promise.all([
    factory.create('bank-account', {
      deleted: '2018-03-21 09:30:00',
      userId: userIdDeleted,
      institutionId,
      bankConnectionId: bankConnectionIdDeletedTwo,
      externalId: Faker.random.alphaNumeric(24),
      displayName: 'Bank Account Dev Deleted Three',
      current: 200,
      available: 200,
      type: 'depository',
      subtype: 'checking',
      accountNumber: '222|222',
      accountNumberAes256: '222|222',
      lastFour: '0002',
    }),
    factory.create('payment-method', {
      deleted: '2018-03-20 10:30:58',
      userId: userIdDeleted,
      bankAccountId: bcaDeleted.id,
      availability: 'immediate',
      mask: '0002',
      displayName: 'Chase Debit: 0002',
      expiration: '2020-02-02',
      scheme: 'visa',
    }),
    factory.create('audit-log', {
      userId: userIdDeleted,
      type: 'USER_CREATED',
      successful: 1,
      created: '2018-03-22 14:00:30',
    }),
    factory.create('audit-log', {
      userId: userIdDeleted,
      type: 'PAYMENT_METHOD_CREATE',
      successful: 0,
      message: 'This card is in use with another account',
      extra: JSON.stringify({
        data: `${duplicateRisepayCustomerId}`,
        name: 'ConflictError',
        stack:
          'ConflictError: This card is in use with another account\n    at verifyCard (/opt/app/src/lib/risepay.js:54:13)\n    at <anonymous>\n    at process.TickCallback (internal/process/nextTick.js:188:7)',
        message: 'This card is in use with another account',
        showUuid: true,
        customCode: null,
        statusCode: 409,
      }),
      created: '2018-03-22 15:00:30',
    }),
    factory.create('audit-log', {
      userId: userIdDeleted,
      type: 'PAYMENT_METHOD_CREATE',
      successful: 1,
      message: 'Payment Method created: BBVA Compass debit: 4444',
      created: '2018-03-22 16:00:30',
    }),
  ]);
}
