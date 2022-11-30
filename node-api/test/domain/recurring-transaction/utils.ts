import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import * as Bluebird from 'bluebird';
import factory from '../../factories';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import * as Utils from '../../../src/domain/recurring-transaction/utils';
import stubBankTransactionClient, {
  upsertBankTransactionForStubs,
} from '../../test-helpers/stub-bank-transaction-client';
import { clean } from '../../test-helpers';

describe('Recurring Transaction utils', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  it('get next occurrence', async () => {
    const transaction = await factory.build('recurring-transaction', {
      interval: RecurringTransactionInterval.MONTHLY,
      params: [10],
    });
    const next = Utils.getNextOccurrence(transaction, moment('2020-04-15'));
    expect(next).to.equal('2020-05-10');
  });

  it('get next occurrence does not consider current day', async () => {
    const transaction = await factory.build('recurring-transaction', {
      interval: RecurringTransactionInterval.MONTHLY,
      params: [10],
    });
    const next = Utils.getNextOccurrence(transaction, moment('2020-04-10'));
    expect(next).to.equal('2020-05-10');
  });

  it('get last occurrence', async () => {
    const transaction = await factory.build('recurring-transaction', {
      interval: RecurringTransactionInterval.MONTHLY,
      params: [10],
    });
    const next = Utils.getLastOccurrence(transaction, moment('2020-04-15'));
    expect(next).to.equal('2020-04-10');
  });

  it('get last occurrence does include current day', async () => {
    const transaction = await factory.build('recurring-transaction', {
      interval: RecurringTransactionInterval.MONTHLY,
      params: [10],
    });
    const next = Utils.getLastOccurrence(transaction, moment('2020-04-10'));
    expect(next).to.equal('2020-04-10');
  });

  it('next and last occurrences are on different days', async () => {
    const transaction = await factory.build('recurring-transaction', {
      interval: RecurringTransactionInterval.MONTHLY,
      params: [moment().date() > 28 ? 28 : moment().date()],
    });

    const next = moment(Utils.getNextOccurrence(transaction));
    const last = moment(Utils.getLastOccurrence(transaction));

    // last interval is inclusive of current day, next interval is not
    expect(last.isSameOrBefore(moment())).to.be.true;
    expect(next.isAfter(moment())).to.be.true;
    expect(next.isSame(last, 'day')).to.be.false;
  });

  describe('isStale', () => {
    it('should mark 11 day old weekly as stale', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['friday'],
      });
      const lastOccurrence = moment().subtract(11, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(true);
    });

    it('should return false for a 7 day old weekly', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['friday'],
      });
      const lastOccurrence = moment().subtract(7, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(false);
    });

    it('should mark 33 day old monthly as stale', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [28],
      });
      const lastOccurrence = moment().subtract(34, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(true);
    });

    it('should mark 33 day old weekday monthly as stale', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKDAY_MONTHLY,
        params: [3, 'friday'],
      });
      const lastOccurrence = moment().subtract(34, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(true);
    });

    it('should mark 18 day old bi weekly as stale', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['friday'],
      });
      const lastOccurrence = moment().subtract(18, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(true);
    });

    it('should mark 18 day old semi monthly as stale', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['friday'],
      });
      const lastOccurrence = moment().subtract(18, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(true);
    });

    it('should return false for a 17 day old semi monthly transaction', async () => {
      const transaction = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [1, 15],
      });
      const lastOccurrence = moment().subtract(17, 'day');
      expect(Utils.isStale(transaction, lastOccurrence)).to.eq(false);
    });
  });
  describe('getMatchingBankTransactions', () => {
    it('should find all matches if lookbackPeriod is -1', async () => {
      const today = moment();
      const name = 'Test';
      const rtxn = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [today.date() > 28 ? 28 : today.date()],
        userAmount: -10,
        userDisplayName: name,
        transactionDisplayName: name,
      });
      const txns = await Bluebird.map([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], async x => {
        return factory.build('bank-transaction', {
          displayName: rtxn.transactionDisplayName,
          bankAccountId: rtxn.bankAccountId,
          userId: rtxn.userId,
          amount: rtxn.userAmount,
          transactionDate: today.clone().subtract(x, 'month'),
        });
      });
      txns.forEach(upsertBankTransactionForStubs);
      const matches = await Utils.getMatchingBankTransactions(rtxn, today, -1);
      const matches60Days = await Utils.getMatchingBankTransactions(rtxn, today);
      expect(matches.length).to.equal(10);
      expect(matches.length > matches60Days.length).to.be.true;
    });

    it('should find all name variation matches', async () => {
      const today = moment();
      const nameUser = 'Test-user';
      const namePending = 'Test-pending';
      const name = 'Test';
      const rtxn = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [today.date() > 28 ? 28 : today.date()],
        userAmount: -10,
        userDisplayName: nameUser,
        pendingDisplayName: namePending,
        transactionDisplayName: name,
      });

      const baseBt = {
        bankAccountId: rtxn.bankAccountId,
        userId: rtxn.userId,
        amount: rtxn.userAmount,
      };
      const names = [nameUser, namePending, name];
      const txns = await Bluebird.map([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], async x => {
        return factory.build('bank-transaction', {
          ...baseBt,
          displayName: names[x % names.length],
          transactionDate: today.clone().subtract(x, 'month'),
        });
      });
      txns.forEach(upsertBankTransactionForStubs);
      const matches = await Utils.getMatchingBankTransactions(rtxn, today, -1);
      expect(matches.length).to.equal(10);
    });
  });
});
