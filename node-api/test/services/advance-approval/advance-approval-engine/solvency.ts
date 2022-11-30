import { clean, stubBalanceLogClient, stubBankTransactionClient, up } from '../../../test-helpers';
import BankingDataClient from '../../../../src/lib/heath-client';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import factory from '../../../factories';
import 'mocha';
import { expect } from 'chai';
import * as Solvency from '../../../../src/services/advance-approval/advance-approval-engine/solvency';

import {
  bankAccountFixture,
  bankConnectionFixture,
  dailyBalanceLogFixture,
  institutionFixture,
  paymentFixture,
  userFixture,
  userSessionFixture,
} from '../../../fixtures';

import { createBalanceLogs } from '../../../test-helpers';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { BalanceLogCaller } from '../../../../src/typings';
import { insertFixtureBankTransactions } from '../../../test-helpers/bank-transaction-fixtures';

describe('Solvency', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  // insert institution fixtures
  beforeEach(() => {
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

  describe('historical payday solvency', () => {
    it('should allow monday over the weekend for payday solvency', async () => {
      const friday = moment()
        .subtract(1, 'week')
        .day('friday');
      const bankAccount = await factory.create('checking-account');
      await createBalanceLogs(
        bankAccount.userId,
        bankAccount.id,
        bankAccount.bankConnectionId,
        friday.clone(),
        [30, 30, 30, 120],
      );
      const paychecks = [await factory.build('bds-bank-transaction', { transactionDate: friday })];
      const solvency = await Solvency.historicalPaydaySolvency(bankAccount.id, paychecks, {
        paychecks: 1,
        days: 1,
        minBalance: 115,
        excludeDavePayments: true,
        businessDaysOnly: true,
      });
      expect(solvency).to.be.true;
    });

    it('should not pass if all over weekend are below', async () => {
      const friday = moment()
        .subtract(1, 'week')
        .day('friday');
      const bankAccount = await factory.create('checking-account');
      await createBalanceLogs(
        bankAccount.userId,
        bankAccount.id,
        bankAccount.bankConnectionId,
        friday.clone(),
        [30, 30, 30, 30],
      );
      const paychecks = [await factory.build('bds-bank-transaction', { transactionDate: friday })];
      const solvency = await Solvency.historicalPaydaySolvency(bankAccount.id, paychecks, {
        paychecks: 1,
        days: 1,
        minBalance: 115,
        excludeDavePayments: true,
        businessDaysOnly: true,
      });
      expect(solvency).to.be.false;
    });

    it('should pass if satuday is above threshold', async () => {
      const friday = moment()
        .subtract(1, 'week')
        .day('friday');
      const bankAccount = await factory.create('checking-account');
      await createBalanceLogs(
        bankAccount.userId,
        bankAccount.id,
        bankAccount.bankConnectionId,
        friday.clone(),
        [30, 120, 30, 30],
      );
      const paychecks = [await factory.build('bds-bank-transaction', { transactionDate: friday })];
      const solvency = await Solvency.historicalPaydaySolvency(bankAccount.id, paychecks, {
        paychecks: 1,
        days: 1,
        minBalance: 115,
        excludeDavePayments: true,
        businessDaysOnly: true,
      });
      expect(solvency).to.be.true;
    });
  });

  describe('lastPaycheckTwoDayMaxBalance', () => {
    it('will not fill in gaps (that sucks)', async () => {
      const bankAccount = await factory.create('checking-account');
      await BankingDataClient.saveBalanceLogs({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        bankConnectionId: bankAccount.bankConnectionId,
        current: 0,
        available: 0,
        processorAccountId: 'asdf',
        processorName: BankingDataSource.Plaid,
        caller: BalanceLogCaller.BankConnectionRefresh,
        date: moment().format('2017-09-21'),
      });
      await BankingDataClient.saveBalanceLogs({
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        bankConnectionId: bankAccount.bankConnectionId,
        current: 200,
        available: 200,
        processorAccountId: 'asdf',
        processorName: BankingDataSource.Plaid,
        caller: BalanceLogCaller.BankConnectionRefresh,
        date: moment().format('2017-10-10'),
      });
      const amount = await Solvency.lastPaycheckTwoDayMaxAccountBalance(
        bankAccount.id,
        await factory.build('bds-bank-transaction', {
          transactionDate: '2017-10-01',
        }),
      );
      expect(amount).to.equal(0);
    });

    it('should return the correct amount', async () => {
      const amount = await Solvency.lastPaycheckTwoDayMaxAccountBalance(
        201,
        await factory.build('bds-bank-transaction', {
          transactionDate: '2017-10-01',
        }),
      );
      expect(amount).to.equal(90);
    });
  });

  describe('historicalPaydaySolvency', () => {
    it('should fail historical payday solvency with default options', async () => {
      const result = await Solvency.historicalPaydaySolvency(201, [
        await factory.build('bds-bank-transaction', { transactionDate: moment('2017-10-01') }),
        await factory.build('bds-bank-transaction', { transactionDate: moment('2017-09-01') }),
      ]);

      expect(result).to.equal(false);
    });

    it('should pass historical payday solvency with non-default options', async () => {
      const result = await Solvency.historicalPaydaySolvency(
        201,
        [
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-10-01') }),
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-09-01') }),
        ],
        {
          paychecks: 2,
          days: 1,
          minBalance: 2,
          excludeDavePayments: true,
          businessDaysOnly: false,
        },
      );

      expect(result).to.equal(true);
    });

    it('should fail historical payday solvency with non-default options', async () => {
      const result = await Solvency.historicalPaydaySolvency(
        201,
        [
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-10-01') }),
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-09-01') }),
        ],
        {
          paychecks: 3,
          days: 3,
          minBalance: 5000,
          excludeDavePayments: true,
          businessDaysOnly: false,
        },
      );

      expect(result).to.equal(false);
    });

    it('should pass historical payday solvency with default options', async () => {
      const result = await Solvency.historicalPaydaySolvency(201, [
        await factory.build('bds-bank-transaction', { transactionDate: moment('2017-09-17') }),
        await factory.build('bds-bank-transaction', { transactionDate: moment('2017-09-01') }),
      ]);

      expect(result).to.equal(true);
    });

    // Balance for 2017-08-01 = 100, 2017-08-02 = 90, 2017-08-03 = 90
    // Advance paid back on 2017-08-01 = 75
    // That should bring the balance fro 2017-08-01 = 175, 2017-08-02 = 165, and 2017-08-03 = 165 if we exclude the amount paid to Dave
    // Same for 2017-07-16, 2017-07-17, 2017-07-18
    it(
      'should pass historical payday solvency with excludeDavePayments option true 2 advances paid back on both' +
        ' payback dates',
      async () => {
        const result = await Solvency.historicalPaydaySolvency(
          201,
          [
            await factory.create('bank-transaction', { transactionDate: '2017-08-01' }),
            await factory.create('bank-transaction', { transactionDate: '2017-07-16' }),
          ],
          {
            paychecks: 2,
            days: 2,
            minBalance: 115,
            excludeDavePayments: true,
            businessDaysOnly: false,
          },
        );

        expect(result).to.equal(true);
      },
    );

    // Balance for 2017-07-01 = 100, 2017-07-02 = 10, 2017-07-03 = 10
    // Advance paid back on 2017-07-01 = 75
    // That should bring the balance fro 2017-07-01 = 175, 2017-07-02 = 85, and 2017-07-03 = 85 if we exclude the amount paid to Dave
    // 175, 85, 86 fails the solvency check of 115
    it('should fail historical payday solvency with excludeDavePayments option true but fail on day 2', async () => {
      const result = await Solvency.historicalPaydaySolvency(
        201,
        [
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-07-01') }),
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-06-16') }),
        ],
        {
          paychecks: 2,
          days: 2,
          minBalance: 115,
          excludeDavePayments: true,
          businessDaysOnly: false,
        },
      );

      expect(result).to.equal(false);
    });

    // Balance for 2017-06-01 = 30, 2017-06-02 = 10, 2017-06-03 = 10
    // Advance paid back on 2017-06-01 = 75
    // That should bring the balance fro 2017-06-01 = 105, 2017-06-02 = 45, and 2017-06-03 = 45 if we exclude the amount paid to Dave
    // 105, 45, 46 fails the solvency check of 115
    it('should fail historical payday solvency with excludeDavePayments option true but fail on day 1 & 2 both', async () => {
      const result = await Solvency.historicalPaydaySolvency(
        201,
        [
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-06-01') }),
          await factory.build('bds-bank-transaction', { transactionDate: moment('2017-05-16') }),
        ],
        {
          paychecks: 2,
          days: 2,
          minBalance: 115,
          excludeDavePayments: true,
          businessDaysOnly: false,
        },
      );

      expect(result).to.equal(false);
    });

    // The balance for 2017-04-16 through 2017-04-18 is 150 which passes without needing to exelude the payback
    // Balance for 2017-05-01 = 100, 2017-05-02 = 40, 2017-05-03 = 40
    // Advance paid back on 2017-05-01 = 75
    // That should bring the balance fro 2017-05-01 = 175, 2017-05-02 = 115, and 2017-05-03 = 115 if we exclude the amount paid to Dave
    it(
      'should pass historical payday solvency with excludeDavePayments option true only one advance paid back on' +
        ' first paycheck date',
      async () => {
        const result = await Solvency.historicalPaydaySolvency(
          201,
          [
            await factory.create('bank-transaction', { transactionDate: '2017-05-01' }),
            await factory.create('bank-transaction', { transactionDate: '2017-04-16' }),
          ],
          {
            paychecks: 2,
            days: 2,
            minBalance: 115,
            excludeDavePayments: true,
            businessDaysOnly: false,
          },
        );

        expect(result).to.equal(true);
      },
    );
  });

  describe('daysAboveThreshold', () => {
    it('pass 3 non-consecutive days above threshold', async () => {
      const result = await Solvency.daysAboveThreshold(
        201,
        50,
        '2018-02-01',
        '2018-02-28',
        true,
        false,
      );
      expect(result).to.equal(3);
    });

    it('pass 0 non-consecutive days above threshold', async () => {
      const result = await Solvency.daysAboveThreshold(
        201,
        50,
        '2018-01-01',
        '2018-01-31',
        true,
        false,
      );
      expect(result).to.equal(0);
    });

    it('pass 1 non-consecutive days above threshold', async () => {
      const result = await Solvency.daysAboveThreshold(
        201,
        50,
        '2018-03-01',
        '2018-03-31',
        true,
        false,
      );
      expect(result).to.equal(1);
    });

    it('pass 4 non-consecutive days above threshold', async () => {
      const result = await Solvency.daysAboveThreshold(
        201,
        50,
        '2018-04-01',
        '2018-04-30',
        true,
        false,
      );
      expect(result).to.equal(4);
    });
  });
});
