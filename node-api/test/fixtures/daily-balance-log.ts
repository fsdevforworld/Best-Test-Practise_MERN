import { moment } from '@dave-inc/time-lib';
import BankingDataClient from '../../src/lib/heath-client';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { BalanceLogCaller } from '../../src/typings';

async function up() {
  const data: Array<[number, number, number, number, number, string, string]> = [
    [
      31,
      31,
      31,
      1000,
      1000,
      'external_account_31',
      moment()
        .subtract(5, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      31,
      31,
      31,
      1000,
      1000,
      'external_account_31',
      moment()
        .subtract(4, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      31,
      31,
      31,
      1000,
      1000,
      'external_account_31',
      moment()
        .subtract(3, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      31,
      31,
      31,
      1000,
      1000,
      'external_account_31',
      moment()
        .subtract(2, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      4,
      2,
      3,
      1250,
      1250,
      'external_account_3',
      moment()
        .subtract(5, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      4,
      2,
      3,
      1250,
      1250,
      'external_account_3',
      moment()
        .subtract(4, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      4,
      2,
      3,
      1250,
      1250,
      'external_account_3',
      moment()
        .subtract(3, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      4,
      2,
      3,
      1250,
      1250,
      'external_account_3',
      moment()
        .subtract(2, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      200,
      200,
      1000,
      1000,
      'external_account_200',
      moment()
        .subtract(5, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      200,
      200,
      1000,
      1000,
      'external_account_200',
      moment()
        .subtract(4, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      200,
      200,
      1000,
      1000,
      'external_account_200',
      moment()
        .subtract(3, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      200,
      200,
      1000,
      1000,
      'external_account_200',
      moment()
        .subtract(2, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      201,
      200,
      1000,
      1000,
      'external_account_201',
      moment()
        .subtract(5, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      201,
      200,
      1000,
      1000,
      'external_account_201',
      moment()
        .subtract(4, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      201,
      200,
      1000,
      1000,
      'external_account_201',
      moment()
        .subtract(3, 'day')
        .format('YYYY-MM-DD'),
    ],
    [
      200,
      201,
      200,
      1000,
      1000,
      'external_account_201',
      moment()
        .subtract(2, 'day')
        .format('YYYY-MM-DD'),
    ],
    [200, 201, 200, 40, 40, 'external_account_201', '2017-09-28'],
    [200, 201, 200, 90, 90, 'external_account_201', '2017-10-01'],
    [200, 201, 200, 10, 10, 'external_account_201', '2017-10-03'],
    [200, 201, 200, 5, 5, 'external_account_201', '2017-10-07'],
    [200, 201, 200, 2000, 2000, 'external_account_201', '2017-09-01'],
    [200, 201, 200, 2000, 2000, 'external_account_201', '2017-09-02'],
    [200, 201, 200, 2000, 2000, 'external_account_201', '2017-09-16'],
    [200, 201, 200, 2000, 2000, 'external_account_201', '2017-09-17'],
    [200, 201, 200, 100, 100, 'external_account_201', '2017-08-01'],
    [200, 201, 200, 90, 90, 'external_account_201', '2017-08-02'],
    [200, 201, 200, 100, 100, 'external_account_201', '2017-07-16'],
    [200, 201, 200, 90, 90, 'external_account_201', '2017-07-17'],
    [200, 201, 200, 100, 100, 'external_account_201', '2017-07-01'],
    [200, 201, 200, 10, 10, 'external_account_201', '2017-07-02'],
    [200, 201, 200, 100, 100, 'external_account_201', '2017-06-16'],
    [200, 201, 200, 10, 10, 'external_account_201', '2017-06-17'],
    [200, 201, 200, 30, 30, 'external_account_201', '2017-06-01'],
    [200, 201, 200, 10, 10, 'external_account_201', '2017-06-02'],
    [200, 201, 200, 30, 30, 'external_account_201', '2017-05-16'],
    [200, 201, 200, 10, 10, 'external_account_201', '2017-05-17'],
    [200, 201, 200, 100, 100, 'external_account_201', '2017-05-01'],
    [200, 201, 200, 40, 40, 'external_account_201', '2017-05-02'],
    [200, 201, 200, 150, 150, 'external_account_201', '2017-04-16'],
    [200, 201, 200, 150, 150, 'external_account_201', '2017-04-17'],
    [200, 201, 200, 5, -5, 'external_account_201', '2018-01-01'],
    [200, 201, 200, 90, 90, 'external_account_201', '2018-02-01'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-02-02'],
    [200, 201, 200, 51, 51, 'external_account_201', '2018-02-03'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-02-04'],
    [200, 201, 200, 50, 50, 'external_account_201', '2018-02-27'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-02-28'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-03-01'],
    [200, 201, 200, 11, 11, 'external_account_201', '2018-03-03'],
    [200, 201, 200, 15, 15, 'external_account_201', '2018-03-07'],
    [200, 201, 200, 50, 50, 'external_account_201', '2018-03-28'],
    [200, 201, 200, 15, 15, 'external_account_201', '2018-03-29'],
    [200, 201, 200, 90, 90, 'external_account_201', '2018-04-01'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-04-02'],
    [200, 201, 200, 55, 55, 'external_account_201', '2018-04-03'],
    [200, 201, 200, 65, 65, 'external_account_201', '2018-04-04'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-04-05'],
    [200, 201, 200, 50, 50, 'external_account_201', '2018-04-28'],
    [200, 201, 200, 10, 10, 'external_account_201', '2018-04-29'],
  ];
  for (const [
    bankConnectionId,
    bankAccountId,
    userId,
    current,
    available,
    processorAccountId,
    date,
  ] of data) {
    await BankingDataClient.saveBalanceLogs({
      bankAccountId,
      bankConnectionId,
      userId,
      current,
      available,
      processorAccountId,
      date,
      processorName: BankingDataSource.Plaid,
      caller: BalanceLogCaller.BankConnectionRefresh,
    });
  }
}

export default { up, tableName: 'daily_balance_log' };
