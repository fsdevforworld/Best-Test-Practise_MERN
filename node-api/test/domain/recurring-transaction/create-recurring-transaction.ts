import { buildAndValidate } from '../../../src/domain/recurring-transaction/create-recurring-transaction';
import { moment } from '@dave-inc/time-lib';
import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import 'chai-as-promised';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import { clean, stubBalanceLogClient, up } from '../../test-helpers';
import factory from '../../factories';
import { RecurringTransactionInterval, RollDirection } from '@dave-inc/wire-typings';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

const sandbox = sinon.createSandbox();

const { BIWEEKLY, MONTHLY } = RecurringTransactionInterval;

describe('RecurringTransactionDomain/create', () => {
  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    insertFixtureBankTransactions();
    await up();
  });
  afterEach(() => clean(sandbox));

  describe('buildAndValidate', () => {
    it('should create a recurring transaction from a bank transaction', async () => {
      const params = {
        bankAccountId: 1200,
        userDisplayName: 'CHeese',
        userAmount: -20,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        bankTransactionId: 1203,
      };
      const rec = await buildAndValidate(params);
      expect(rec).to.deep.include({
        id: null,
        bankAccountId: 1200,
        missed: null,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        type: 'EXPENSE',
        userId: 1200,
        pendingDisplayName: null,
        deleted: '9999-12-31 23:59:59+00:00',
        status: 'VALID',
      });
      expect(rec.rsched.interval).to.equal('MONTHLY');
      expect(rec.rsched.params).to.deep.equal([1]);
      expect(rec.rsched.rollDirection).to.equal(0);
      expect(rec.rsched.weeklyStart.toString()).to.equal(
        moment()
          .subtract(1, 'month')
          .startOf('month')
          .format('YYYY-MM-DD'),
      );
    });

    it('should create a single observation recurring transaction from a bank transaction', async () => {
      const bt = await factory.create('bank-transaction', {
        amount: 500,
        displayName: 'hey there',
        transactionDate: moment()
          .startOf('week')
          .subtract(1, 'week')
          .add('days', 3),
      });
      const params = {
        userId: bt.userId,
        bankAccountId: bt.bankAccountId,
        bankTransactionId: bt.id,
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['wednesday'],
        type: TransactionType.INCOME,
        status: RecurringTransactionStatus.SINGLE_OBSERVATION,
      };
      const rec = await buildAndValidate(params);
      expect(rec.transactionDisplayName).to.equal(bt.displayName);
      expect(rec.rsched.interval).to.equal(RecurringTransactionInterval.BIWEEKLY);
      expect(rec.rsched.params).to.deep.equal(['wednesday']);
      expect(rec.status).to.equal(RecurringTransactionStatus.SINGLE_OBSERVATION);
    });

    it('should find correct start date when creating from bank transactions', async () => {
      const user = await factory.create('user', { id: 99 });
      const ba = await factory.create('bank-account', { userId: user.id });
      const bt0 = await factory.create('bank-transaction', {
        bankAccountId: ba.id,
        userId: user.id,
        amount: 500,
        displayName: 'cheeseburger fund',
        transactionDate: '2020-04-20',
      });
      const bt1 = await factory.create('bank-transaction', {
        bankAccountId: ba.id,
        userId: user.id,
        amount: bt0.amount,
        displayName: bt0.displayName,
        transactionDate: '2020-04-06',
      });

      // incorrectly offset start date
      const submitTime = moment('2020-04-30');
      const params = {
        bankAccountId: ba.id,
        bankTransactionId: bt0.id,
        interval: BIWEEKLY,
        rollDirection: -1 as RollDirection,
        params: ['monday'],
        userAmount: bt1.amount,
      };

      sandbox.useFakeTimers({ now: submitTime.unix() * 1000 });
      const rec = await buildAndValidate(params);

      expect(rec).to.deep.include({
        bankAccountId: params.bankAccountId,
        userAmount: params.userAmount,
        transactionDisplayName: bt1.displayName,
        type: 'INCOME',
        status: 'VALID',
      });
      expect(rec.rsched.interval).to.equal(params.interval);
      expect(rec.rsched.params).to.deep.equal(params.params);
      expect(rec.rsched.rollDirection).to.equal(params.rollDirection);
      expect(rec.rsched.weeklyStart.toString()).to.equal(bt1.transactionDate);
    });

    it('should fail with income and only one bank transaction', async () => {
      const params = {
        bankAccountId: 31,
        userDisplayName: 'CHeese',
        userAmount: 20,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        userId: 1,
        bankTransactionId: 19,
      };
      const trans = buildAndValidate(params);
      return expect(trans).to.be.rejectedWith('Must have at least 2 matching paychecks');
    });

    it('should fail with bad bankTransactionId', async () => {
      const params = {
        bankAccountId: 31,
        userDisplayName: 'CHeese',
        userAmount: 20,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        userId: 1,
        bankTransactionId: 1000000,
      };
      const trans = buildAndValidate(params);
      return expect(trans).to.be.rejectedWith('Bank Transaction not found');
    });

    it('should fail with if user amount is opposite', async () => {
      const params = {
        bankAccountId: 31,
        userDisplayName: 'CHeese',
        userAmount: -20,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        bankTransactionId: 19,
      };
      const trans = buildAndValidate(params);
      return expect(trans).to.be.rejectedWith(
        'User submitted amount must have same sign as transaction',
      );
    });

    it('should set status to not validated if skip validity check is true', async () => {
      const params = {
        bankAccountId: 1200,
        userDisplayName: 'CHeese',
        userAmount: -20,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: true,
        bankTransactionId: 1203,
      };
      const rec = await buildAndValidate(params);
      expect(rec.status).to.eq(RecurringTransactionStatus.NOT_VALIDATED);
    });

    it('should throw invalid params if invalid interval is passed', async () => {
      const params = {
        bankAccountId: 1200,
        interval: 'bacon' as RecurringTransactionInterval,
        params: [2],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      };
      expect(buildAndValidate(params)).to.be.rejectedWith(
        'Interval must be one of monthly, weekly, biweekly or semi_monthly',
      );
    });

    it('should throw invalid params if invalid interval is semi monthly', async () => {
      const params = {
        bankAccountId: 1200,
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [2],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      };
      expect(buildAndValidate(params)).to.be.rejectedWith(
        'params should be array of integers with length 2',
      );
    });

    it('should throw invalid params if invalid interval is semi monthly', async () => {
      const params = {
        bankAccountId: 1200,
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['bacon'],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      };
      expect(buildAndValidate(params)).to.be.rejectedWith('params[0] must be lowercased weekday');
    });
  });
});
