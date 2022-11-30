import { clean, stubBalanceLogClient, stubBankTransactionClient, up } from '../../test-helpers';
import {
  backfillDailyBalances,
  excludeDavePaymentsFromBalances,
  getByDateRange,
} from '../../../src/domain/banking-data-sync/daily-balance-log';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import factory from '../../factories';
import 'mocha';
import { expect } from 'chai';

import {
  bankAccountFixture,
  bankConnectionFixture,
  dailyBalanceLogFixture,
  institutionFixture,
  paymentFixture,
  userFixture,
  userSessionFixture,
} from '../../fixtures';
import BankAccount from '../../../src/models/bank-account';
import { BalanceLogCaller } from '../../../src/typings';
import { DailyBalanceLike } from '../../../src/typings/balance-log';
import { BankingDataSource } from '@dave-inc/wire-typings';
import BankingDataClient from '../../../src/lib/heath-client';
import { sequelize } from '../../../src/models';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

describe('BankingDataSync / Daily Balance Log', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  // insert institution fixtures
  beforeEach(async () => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up([
      userFixture,
      userSessionFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      dailyBalanceLogFixture,
      paymentFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  describe('exclude dave payments from balances', () => {
    it('should match payments to bank_transactions and exclude those form the balances', async () => {
      const ba = await factory.create('checking-account');
      const ids = { userId: ba.userId, bankAccountId: ba.id };
      const date = '2018-05-05';
      const bankTransaction = await factory.create('bank-transaction', {
        ...ids,
        amount: 75,
        transactionDate: date,
      });
      await factory.create('payment', {
        ...ids,
        amount: 75,
        bankTransactionId: bankTransaction.id,
      });
      const balances = [
        { date, available: 25, current: 0 },
        { date, available: 10, current: 0 },
      ];
      const result = await excludeDavePaymentsFromBalances(balances, date, date, ba.id);
      expect(result[0].available).to.equal(100);
      expect(result[1].available).to.equal(85);
    });

    it('should match payments to bank_transactions through bank transaction if bank account id is not set', async () => {
      const ba = await factory.create('checking-account');
      const ids = { userId: ba.userId, bankAccountId: ba.id };
      const date = '2018-05-05';
      const bankTransaction = await factory.create('bank-transaction', {
        ...ids,
        amount: 75,
        transactionDate: date,
      });
      await factory.create('payment', {
        bankAccountId: null,
        userId: ba.userId,
        amount: 75,
        bankTransactionId: bankTransaction.id,
      });
      const balances = [
        { date, available: 25, current: 0 },
        { date, available: 10, current: 0 },
      ];
      const result = await excludeDavePaymentsFromBalances(balances, date, date, ba.id);
      expect(result[0].available).to.equal(100);
      expect(result[1].available).to.equal(85);
    });

    it('should not add payment to null available balance', async () => {
      const ba = await factory.create('checking-account');
      const ids = { userId: ba.userId, bankAccountId: ba.id };
      const date = '2018-05-05';
      const bankTransaction = await factory.create('bank-transaction', {
        ...ids,
        amount: 75,
        transactionDate: date,
      });
      await factory.create('payment', {
        bankAccountId: null,
        userId: ba.userId,
        amount: 75,
        bankTransactionId: bankTransaction.id,
      });
      const balances: DailyBalanceLike[] = [
        { date, available: null, current: 0 },
        { date, available: null, current: 0 },
      ];
      const result = await excludeDavePaymentsFromBalances(balances, date, date, ba.id);
      expect(result[0].current).to.equal(75);
      expect(result[1].current).to.equal(75);
      expect(result[1].available).to.equal(null);
    });

    it('should not match if bank account ids do not match', async () => {
      const ba = await factory.create('checking-account');
      const ids = { userId: ba.userId, bankAccountId: ba.id };
      const date = '2018-05-05';
      const bankTransaction = await factory.create('bank-transaction', {
        ...ids,
        amount: 75,
        transactionDate: date,
      });
      await factory.create('payment', {
        bankAccountId: 123,
        userId: ba.userId,
        amount: 75,
        bankTransactionId: bankTransaction.id,
      });
      const balances = [
        { date, available: 25, current: 0 },
        { date, available: 10, current: 0 },
      ];
      const result = await excludeDavePaymentsFromBalances(balances, date, date, ba.id);
      expect(result[0].available).to.equal(25);
      expect(result[1].available).to.equal(10);
    });
  });

  describe('backfillDailyBalances', () => {
    let account: BankAccount;

    beforeEach(async () => {
      account = await factory.create('checking-account');
    });

    it('should backfill 6 weeks with no lastPull date', async () => {
      const transactions = await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: moment()
            .subtract(6, 'weeks')
            .subtract(1, 'day'),
        }),
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: moment()
            .subtract(6, 'weeks')
            .add(1, 'day'),
        }),
      ]);
      await backfillDailyBalances(account, BalanceLogCaller.BankConnectionRefresh); //caller randomly chosen from among callers that actually call this in production
      const logs = await BankingDataClient.getBalanceLogs(account.id, {
        start: moment().subtract(10, 'years'),
        end: moment(),
      });

      expect(logs.length).to.eq(42);
      expect(logs[0].available).to.eq(account.available - transactions[1].amount);
      expect(logs[1].available).to.eq(account.available);
    });

    it('should backfill up to the last pull date if provided', async () => {
      const lastPull = moment().subtract(30, 'days');
      const transactions = await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: lastPull.clone(),
        }),
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: lastPull.clone().add(1, 'day'),
        }),
      ]);
      await backfillDailyBalances(
        account,
        BalanceLogCaller.BankConnectionRefresh,
        BankingDataSource.Plaid,
        lastPull,
      ); //caller randomly chosen from among callers that actually call this in production
      const logs = await BankingDataClient.getBalanceLogs(account.id, {
        start: moment().subtract(10, 'years'),
        end: moment(),
      });
      expect(logs.length).to.eq(29);
      expect(logs[0].available).to.eq(account.available - transactions[1].amount);
      expect(logs[1].available).to.eq(account.available);
    });

    it('should not backfill if last update was < 2 days ago', async () => {
      const lastPull = moment().subtract(1, 'days');
      await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: lastPull.clone(),
        }),
        factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: account.userId,
          transactionDate: lastPull.clone().add(1, 'day'),
        }),
      ]);
      await backfillDailyBalances(
        account,
        BalanceLogCaller.PlaidUpdaterPubsub,
        BankingDataSource.Plaid,
        lastPull,
      ); //caller randomly chosen from among callers that actually call this in production
      const logs = await BankingDataClient.getBalanceLogs(account.id, {
        start: moment().subtract(10, 'years'),
        end: moment(),
      });
      expect(logs.length).to.eq(0);
    });

    it('wont create future balance logs in stupid cases', async () => {
      const lastPull = moment().subtract(6, 'days');
      await sequelize.query('UPDATE bank_account SET updated = ? WHERE id = ?', {
        replacements: [
          moment()
            .subtract(1, 'year')
            .format('YYYY-MM-DD'),
          account.id,
        ],
      });
      await account.reload();
      await backfillDailyBalances(
        account,
        BalanceLogCaller.PlaidUpdaterPubsub,
        BankingDataSource.Plaid,
        lastPull,
      ); //caller randomly chosen from among callers that actually call this in production
      const logs = await BankingDataClient.getBalanceLogs(account.id, {
        start: moment().subtract(10, 'years'),
        end: moment().add(10, 'years'),
      });
      expect(logs.length).to.eq(0);
    });
  });

  describe('getByDateRange', () => {
    xit('get backfill 6 weeks of daily_balance_log rows', async () => {
      const ba = await BankAccount.findByPk(22);
      await backfillDailyBalances(ba, BalanceLogCaller.PlaidUpdaterPubsub); //caller randomly chosen from among callers that actually call this in production
      const results = await getByDateRange(
        22,
        moment()
          .startOf('day')
          .subtract(22, 'days')
          .format('YYYY-MM-DD'),
        moment()
          .startOf('day')
          .subtract(1, 'days')
          .format('YYYY-MM-DD'),
      );
      expect(results.length).to.equal(22);
      const yesterday = results[results.length - 1];
      expect(
        moment(yesterday.date).isSame(
          moment()
            .startOf('day')
            .subtract(1, 'day'),
        ),
      ).to.equal(true);
      expect(yesterday.current).to.equal(60);
      expect(yesterday.available).to.equal(58);
      expect(results[20].current).to.equal(80);
      expect(results[20].available).to.equal(78);
      expect(results[19].current).to.equal(80);
      expect(results[19].available).to.equal(80);
      expect(results[0].current).to.equal(135);
      expect(results[0].available).to.equal(135);
    });

    it('should fill in intermediary gaps between daily_balance_log rows for specified date range', async () => {
      // datapoints exist for 10-01, 10-03, 10-07
      const balances = await getByDateRange(201, '2017-10-01', '2017-10-07');
      expect(balances.length).to.equal(7);

      expect(balances[0].current).to.equal(90);
      expect(balances[0].date).to.equal('2017-10-01');
      expect(balances[1].current).to.equal(90);
      expect(balances[1].date).to.equal('2017-10-02');
      expect(balances[2].current).to.equal(10);
      expect(balances[2].date).to.equal('2017-10-03');
      expect(balances[3].current).to.equal(10);
      expect(balances[3].date).to.equal('2017-10-04');
      expect(balances[4].current).to.equal(10);
      expect(balances[4].date).to.equal('2017-10-05');
      expect(balances[5].current).to.equal(10);
      expect(balances[5].date).to.equal('2017-10-06');
      expect(balances[6].current).to.equal(5);
      expect(balances[6].date).to.equal('2017-10-07');
    });
    it('if daily_balance_row for date range start is not found, it should look backwards to infer balances', async () => {
      // datapoints exist for 9-28, 10-01
      const balances = await getByDateRange(201, '2017-09-30', '2017-10-02');
      expect(balances.length).to.equal(3);

      expect(balances[0].current).to.equal(40);
      expect(balances[0].date).to.equal('2017-09-30');
      expect(balances[1].current).to.equal(90);
      expect(balances[1].date).to.equal('2017-10-01');
      expect(balances[2].current).to.equal(90);
      expect(balances[2].date).to.equal('2017-10-02');
    });
  });
});
