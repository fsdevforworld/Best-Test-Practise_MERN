import * as sinon from 'sinon';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import * as Forecast from '../../../src/domain/forecast';
import factory from '../../factories';
import * as RecurringTransactionDomain from '../../../src/domain/recurring-transaction';
import { BankAccount, BankConnection, ExpectedTransaction } from '../../../src/models';
import { sequelize } from '../../../src/models';
import { shallowMungeObjToCase } from '../../../src/lib/utils';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import 'mocha';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import { Moment } from 'moment';
import { QueryTypes } from 'sequelize';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

describe('ForecastDomain', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  async function mockGetExpectedByAccountId(bankAccountId: number, start: Moment, stop: Moment) {
    const results = await sequelize.query<any>(
      'SELECT * FROM expected_transaction WHERE bank_account_id = ? AND expected_date >= ? AND expected_date <= ?',
      { replacements: [bankAccountId, start, stop], type: QueryTypes.SELECT },
    );
    return results.map((x: any) =>
      ExpectedTransaction.build(shallowMungeObjToCase(x, 'camelCase')),
    );
  }

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up();
  });

  afterEach(() => clean(sandbox));

  describe('computeAccountForecastFromBankAccountId', () => {
    const lastDayOfMonth =
      moment()
        .tz(DEFAULT_TIMEZONE)
        .date() ===
      moment()
        .tz(DEFAULT_TIMEZONE)
        .endOf('month')
        .date();
    it('should predict no change in balance for accounts with no pending or recurring transactions', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(100);
      expect(forecast.pending.length).to.equal(0);
      expect(forecast.recurring.length).to.equal(0);
      expect(forecast.lowestBalance).to.equal(100);
      expect(forecast.startBalance).to.equal(100);
      // No main paycheck id set, so it'll be null.
      expect(forecast.paycheck).to.be.null;
    });

    it("should compute the lowest balance with pending transactions for institutions that don't include them in their balances", async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(101);
      expect(forecast.pending.length).to.equal(1);
      expect(forecast.recurring.length).to.equal(0);
      expect(forecast.lowestBalance).to.equal(81);
      expect(forecast.startBalance).to.equal(101);
    });

    it('should compute the lowest balance without pending transactions for dave checking', async () => {
      const daveChecking = await BankAccount.findByPk(101, {
        include: [
          {
            model: BankConnection,
          },
        ],
      });

      daveChecking.bankConnection.bankingDataSource = BankingDataSource.BankOfDave;
      await daveChecking.bankConnection.save();

      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);

      const forecast = await Forecast.computeAccountForecastFromBankAccountId(101);

      expect(forecast.pending.length).to.equal(1);
      expect(forecast.recurring.length).to.equal(0);
      expect(forecast.lowestBalance).to.equal(101);
      expect(forecast.startBalance).to.equal(101);
    });

    it('should compute the lowest balance for accounts with a recurring expense', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(102);
      expect(forecast.pending.length).to.equal(0);
      expect(forecast.recurring.length).to.equal(1);
      expect(forecast.lowestBalance).to.equal(82);
      expect(forecast.startBalance).to.equal(102);
    });

    it('should compute the lowest balance for accounts with both pending and recurring expenses', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(103);
      expect(forecast.pending.length).to.equal(1);
      expect(forecast.recurring.length).to.equal(1);
      expect(forecast.lowestBalance).to.equal(63);
      expect(forecast.startBalance).to.equal(103);
    });

    it('should compute the lowest balance when the current balance is the lowest balance due to pending income', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(104);
      expect(forecast.pending.length).to.equal(1);
      expect(forecast.recurring.length).to.equal(1);
      expect(forecast.lowestBalance).to.equal(104);
      expect(forecast.startBalance).to.equal(104);
    });

    it('includes a userFriendlyName', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(104);
      expect(forecast.pending[0].userFriendlyName).to.equal('Name');
      expect(forecast.recurring[0].userFriendlyName).to.exist;
    });

    it('should return null if no account exists', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(0);
      expect(forecast).to.equal(null);
    });

    it('should use the remaining recurring incomes in calculations within pay period', async () => {
      const today = moment();
      const recurring = await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 2 : today.date() + 2],
        userAmount: 210,
      });
      await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 3 : today.date() + 3],
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
      });
      await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 1 : today.date() + 1],
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        userAmount: 20,
      });
      await BankAccount.update(
        { mainPaycheckRecurringTransactionId: recurring.id },
        { where: { id: recurring.bankAccountId } },
      );

      const forecastOld = await Forecast.computeAccountForecastFromBankAccountId(
        recurring.bankAccountId,
        { startFromPayPeriod: false },
      );
      expect(forecastOld.recurring.length).to.equal(1);
      expect(forecastOld.lowestBalance).to.equal(forecastOld.startBalance);

      const forecastFromLastPayday = await Forecast.computeAccountForecastFromBankAccountId(
        recurring.bankAccountId,
        { startFromPayPeriod: true },
      );
      expect(forecastFromLastPayday.recurring.length).to.equal(3);
    });

    it('should calculate only bank transactions in the forecast date range', async () => {
      const today = moment();
      const recurring = await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 2 : today.date() + 2],
        userAmount: 210,
      });
      await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 3 : today.date() + 3],
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        userAmount: -20,
      });
      await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [today.date() > 25 ? 1 : today.date() + 1],
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        userAmount: -20,
      });
      await BankAccount.update(
        { mainPaycheckRecurringTransactionId: recurring.id },
        { where: { id: recurring.bankAccountId } },
      );

      const forecastOld = await Forecast.computeAccountForecastFromBankAccountId(
        recurring.bankAccountId,
        { startFromPayPeriod: false },
      );
      expect(forecastOld.recurring.length).to.equal(1); // Non calculating txns will not appear.
      expect(forecastOld.lowestBalance).to.equal(forecastOld.startBalance - 20);
    });

    it('should distinguish between recurring, non-recurring, and occurred recurring expenses', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(111);
      expect(forecast.startBalance).to.equal(111);
      expect(forecast.lowestBalance).to.equal(108);
      expect(forecast.pending.length).to.equal(0);
      expect(forecast.recurring.length).to.equal(2);
      if (!lastDayOfMonth) {
        expect(
          forecast.recurring.find((item: any) => item.id === 115).occurredTransaction.id,
        ).to.equal(115);
        expect(
          forecast.recurring.find((item: any) => item.id === 116).occurredTransaction,
        ).to.equal(undefined);
      }
    });

    it('should match recurring and bank transactions by name regardless of amount', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(112);
      if (lastDayOfMonth) {
        expect(forecast.recurring.length).to.eq(1);
      } else {
        expect(forecast.recurring[0].amount).to.equal(-2);
      }
    });

    it('should calculate the lowest possible balance inclusive of start and stopping dates', async () => {
      const recurring = await factory.create('recurring-transaction', {
        interval: 'WEEKLY',
        params: [
          moment()
            .day(
              (moment()
                .tz('America/Los_Angeles')
                .day() +
                6) %
                7,
            )
            .format('dddd')
            .toLowerCase(),
        ],
        userAmount: 200,
      });
      await factory.create('recurring-transaction', {
        interval: 'WEEKLY',
        params: [
          moment()
            .tz('America/Los_Angeles')
            .format('dddd')
            .toLowerCase(),
        ],
        bankAccountId: recurring.bankAccountId,
        userAmount: -10,
        userId: recurring.userId,
      });
      await factory.create('recurring-transaction', {
        interval: 'WEEKLY',
        params: [
          moment()
            .tz('America/Los_Angeles')
            .day(
              (moment()
                .tz('America/Los_Angeles')
                .day() +
                5) %
                7,
            )
            .format('dddd')
            .toLowerCase(),
        ],
        bankAccountId: recurring.bankAccountId,
        userAmount: -10,
        userId: recurring.userId,
      });
      await BankAccount.update(
        { mainPaycheckRecurringTransactionId: recurring.id },
        { where: { id: recurring.bankAccountId } },
      );
      const forecastOld = await Forecast.computeAccountForecastFromBankAccountId(
        recurring.bankAccountId,
        { startFromPayPeriod: false },
      );
      const balance = -20;
      expect(forecastOld.lowestBalance).to.equal(balance);

      const forecastFromLastPayday = await Forecast.computeAccountForecastFromBankAccountId(
        recurring.bankAccountId,
        { startFromPayPeriod: true },
      );
      expect(forecastFromLastPayday.lowestBalance).to.equal(0);
    });

    it('should have a paycheck included if main paycheck id is set', async () => {
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .callsFake(mockGetExpectedByAccountId);
      const paycheckRecurringTransaction = await factory.create('recurring-transaction', {
        interval: 'weekly',
        params: ['monday'],
      });
      await BankAccount.update(
        { mainPaycheckRecurringTransactionId: paycheckRecurringTransaction.id },
        {
          where: { id: paycheckRecurringTransaction.bankAccountId },
        },
      );
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(
        paycheckRecurringTransaction.bankAccountId,
      );
      expect(forecast.paycheck).to.not.be.null;
      expect(forecast.paycheck.displayName).to.equal(paycheckRecurringTransaction.userDisplayName);
    });

    it('should forecast next pay period if next expected paycheck has already settled', async () => {
      sandbox.useFakeTimers(moment('2020-07-01').unix() * 1000);
      const paycheckRecurringTransaction = await factory.create('recurring-transaction', {
        interval: 'weekly',
        params: ['thursday'],
      });
      const settledExpected = await factory.build('expected-paycheck', {
        recurringTransactionId: paycheckRecurringTransaction.id,
        expectedDate: moment('2020-07-02'),
        settledDate: moment('2020-07-02'),
      });

      sandbox
        .stub(RecurringTransactionDomain, 'getNextExpectedPaycheckForAccount')
        .resolves(settledExpected);
      sandbox
        .stub(RecurringTransactionDomain, 'getExpectedTransactionsByAccountId')
        .resolves([settledExpected]);
      sandbox.stub(RecurringTransactionDomain, 'getMatchingBankTransactions').resolves([
        {
          transactionDate: '2020-07-02',
        },
        {
          transactionDate: '2020-06-25',
        },
      ]);
      const forecast = await Forecast.computeAccountForecastFromBankAccountId(
        paycheckRecurringTransaction.bankAccountId,
        { startFromPayPeriod: true },
      );

      expect(forecast.start).to.equal('2020-07-02');
      expect(forecast.stop).to.equal('2020-07-08');
    });
  });
});
