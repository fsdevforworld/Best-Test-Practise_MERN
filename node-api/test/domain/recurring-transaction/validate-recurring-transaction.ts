import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import * as ValidateRecurring from '../../../src/domain/recurring-transaction/validate-recurring-transaction';
import * as Store from '../../../src/domain/recurring-transaction/store';
import {
  CreateParams,
  RecurringTransaction,
} from '../../../src/domain/recurring-transaction/types';
import * as Utils from '../../../src/domain/recurring-transaction/utils';
import { RecurringTransaction as DBRecurringTransaction } from '../../../src/models';
import { DateOnly, moment } from '@dave-inc/time-lib';
import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import 'chai-as-promised';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import { RecurringTransactionStatus } from '../../../src/typings';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';

const { MONTHLY, SEMI_MONTHLY, WEEKLY, BIWEEKLY } = RecurringTransactionInterval;

describe('RecurringTransactionDomain/validate', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    await up();
  });

  afterEach(() => clean(sandbox));

  function buildRecurring(params: Partial<CreateParams> = {}): RecurringTransaction {
    const dbRecurring = DBRecurringTransaction.build(params);
    return Store.formatRecurringTransaction(dbRecurring);
  }

  describe('perform validity check', () => {
    it('should validate a valid transaction', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      const res = await ValidateRecurring.performValidityCheck(trxn);
      expect(res).to.not.be.null;
    });

    it('should not validate active hours', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: BIWEEKLY,
        params: ['monday'],
        skipValidityCheck: false,
        transactionDisplayName: 'B ACTIVEHOURS C',
        userAmount: 50,
        userDisplayName: 'CHeese',
        userId: 1200,
        status: RecurringTransactionStatus.VALID,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        'Incomes of this type are not accepted.',
      );
    });

    it('should not validate dave if below $100 average', async () => {
      const bankAccount = await factory.create('checking-account');
      await factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: 'DAVE',
        transactionDate: moment().weekday(1),
        amount: 50,
      });
      await factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: 'DAVE',
        amount: 100,
        transactionDate: moment()
          .weekday(1)
          .subtract(2, 'week'),
      });
      const trxn = buildRecurring({
        bankAccountId: bankAccount.id,
        interval: BIWEEKLY,
        params: ['monday'],
        skipValidityCheck: false,
        transactionDisplayName: 'DAVE',
        userAmount: 50,
        userDisplayName: 'CHeese',
        userId: bankAccount.userId,
        status: RecurringTransactionStatus.VALID,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        'Incomes of this type are not accepted.',
      );
    });

    it('should validate dave if average above $200 average', async () => {
      const bankAccount = await factory.create('checking-account');
      await factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: 'DAVE',
        transactionDate: moment()
          .weekday(1)
          .subtract(1, 'week'),
        amount: 400,
      });
      await factory.create('bank-transaction', {
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: 'DAVE',
        amount: 200,
        transactionDate: moment()
          .weekday(1)
          .subtract(3, 'week'),
      });
      const trxn = buildRecurring({
        bankAccountId: bankAccount.id,
        interval: BIWEEKLY,
        params: ['monday'],
        skipValidityCheck: false,
        transactionDisplayName: 'DAVE',
        userAmount: 100,
        userDisplayName: 'CHeese',
        userId: bankAccount.userId,
        status: RecurringTransactionStatus.VALID,
      });
      return ValidateRecurring.performValidityCheck(trxn).should.eventually.be.fulfilled;
    });

    it('should not validate if the param is incorrect', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [10],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I'm seeing a different schedule for this transaction, please try again",
      );
    });

    it('should not validate if the interval is incorrect', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: SEMI_MONTHLY,
        params: [1, 10],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I'm seeing a different schedule for this transaction, please try again",
      );
    });

    it('should allow some fuzziness', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [2],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      await ValidateRecurring.performValidityCheck(trxn);
    });

    it('should filter out transactions with the opposite sign', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [2],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: 20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I don't see this transaction in your account history.",
      );
    });

    it('should not match semi monthly with close dates', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: SEMI_MONTHLY,
        params: [1, 2],
        skipValidityCheck: false,
        transactionDisplayName: 'Bacon',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I'm seeing a different schedule for this transaction, please try again",
      );
    });

    it('should validate active hours expense', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: BIWEEKLY,
        params: ['monday'],
        skipValidityCheck: false,
        transactionDisplayName: 'B ACTIVEHOURS C',
        userAmount: -20,
        userDisplayName: 'CHeese',
        userId: 1200,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I don't see this transaction in your account history.",
      );
    });

    it('should validate credit with transfers as income', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: BIWEEKLY,
        params: ['monday'],
        skipValidityCheck: false,
        transactionDisplayName: 'Credit',
        userAmount: 50,
        userDisplayName: 'CHeese',
        userId: 1,
      });
      return expect(ValidateRecurring.performValidityCheck(trxn)).to.be.rejectedWith(
        "I don't see this transaction in your account history.",
      );
    });

    it('should remove duplicates from the results', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        transactionDisplayName: 'Credit',
        userAmount: 50,
        userDisplayName: 'CHeese',
        userId: 1,
      });
      sandbox.stub(Utils, 'getMatchingBankTransactions').resolves([
        { transactionDate: moment().date(1), amount: 20 },
        { transactionDate: moment().date(1), amount: 20 },
        {
          transactionDate: moment()
            .subtract(1, 'month')
            .date(1),
          amount: 20,
        },
        {
          transactionDate: moment()
            .subtract(1, 'month')
            .date(1),
          amount: 20,
        },
      ]);

      const res = await ValidateRecurring.performValidityCheck(trxn);
      expect(res).to.not.be.null;
    });

    it('should validate name with deposit', async () => {
      const trxn = buildRecurring({
        bankAccountId: 1200,
        interval: MONTHLY,
        params: [1],
        skipValidityCheck: false,
        transactionDisplayName: 'Direct Deposit cheese',
        userAmount: 50,
        userDisplayName: 'Direct Deposit cheese',
        userId: 2,
      });
      sandbox.stub(Utils, 'getMatchingBankTransactions').resolves([
        { transactionDate: moment().date(1), amount: 20 },
        {
          transactionDate: moment()
            .subtract(1, 'month')
            .date(1),
          amount: 50,
        },
      ]);

      const res = await ValidateRecurring.performValidityCheck(trxn);
      expect(res).to.not.be.null;
    });
  });

  describe('isCashDeposit', () => {
    it('should not validate bad name money', async () => {
      expect(ValidateRecurring.isCashDeposit('PopMoney', 50)).to.eq(true);
    });

    it('should not validate name with cash deposit', async () => {
      expect(ValidateRecurring.isCashDeposit('Cash Deposit cheese', 50)).to.eq(true);
      expect(ValidateRecurring.isCashDeposit('my visa direct', 150)).to.eq(true);
      expect(ValidateRecurring.isCashDeposit('PMNT RCVD', 30)).to.eq(true);
      expect(ValidateRecurring.isCashDeposit('Branch Messenger Other Debit', 100)).to.eq(true);
      expect(ValidateRecurring.isCashDeposit('Cash App*Cash Out', 355)).to.eq(true);
    });

    it('should not validate bad name deposit', async () => {
      expect(ValidateRecurring.isCashDeposit('DEPOsit', 50)).to.eq(true);
    });

    it('should do nothing to a valid income', async () => {
      expect(ValidateRecurring.isCashDeposit('Walmart', 50)).to.eq(false);
    });
  });

  describe('recursively validate params', () => {
    it('should fail with extra expected', () => {
      const observed = [moment('2017-01-01'), moment('2017-02-01')].map(DateOnly.fromMoment);
      return expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(
          buildRecurring({
            interval: SEMI_MONTHLY,
            params: [1, 15],
          }),
          observed,
        );
      }).to.throw("I'm seeing a different schedule for this transaction, please try again.");
    });

    it('should succeed with extra observed', async () => {
      const observed = [moment('2017-01-01'), moment('2017-01-15'), moment('2017-02-01')].map(
        DateOnly.fromMoment,
      );
      const rec = buildRecurring({
        interval: SEMI_MONTHLY,
        params: [1, 15],
      });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2017-02-10'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2017-01-01');
    });

    it('should roll with uppercase interval', async () => {
      const observed = [
        '2018-04-25',
        '2018-04-10',
        '2018-03-23',
        '2018-03-09',
        '2018-02-23',
        '2018-02-09',
        '2018-01-25',
        '2018-01-10',
        '2017-12-08',
      ].map(x => DateOnly.fromString(x));
      const rec = buildRecurring({
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [10, 25],
      });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2018-05-01'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2018-01-10');
    });

    it('should validate biweekly pay schedule by cutting down to only 3 matchin', async () => {
      const observed = ['2018-07-06', '2018-06-22', '2018-06-08', '2018-05-31'].map(x =>
        DateOnly.fromString(x),
      );
      const rec = buildRecurring({
        interval: RecurringTransactionInterval.BIWEEKLY,
        params: ['friday'],
        dtstart: moment('2018-06-08T00:00:00.000Z'),
      });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2018-07-10'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2018-06-08');
    });

    it('should fail if not seen', async () => {
      const dates = [
        '2018-05-22',
        '2018-05-08',
        '2018-04-24',
        '2018-04-10',
        '2018-03-27',
        '2018-03-13',
      ].map(x => DateOnly.fromString(x));
      const rec = buildRecurring({
        interval: BIWEEKLY,
        params: ['tuesday'],
      });
      return expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(rec, dates, {
          today: DateOnly.fromString('2018-06-10'),
        });
      }).to.throw(`I don't see this transaction after May 22`);
    });

    it('should validate with biweekly fuzziness', async () => {
      const dates = [
        '2018-05-22',
        '2018-05-08',
        '2018-04-24',
        '2018-04-10',
        '2018-03-27',
        '2018-03-13',
      ].map(x => DateOnly.fromString(x));
      const rec = buildRecurring({
        interval: BIWEEKLY,
        params: ['monday'],
      });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, dates, {
        today: DateOnly.fromString('2018-05-25'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2018-03-12');
    });

    it('should not validate with 3 dates and 1 match', async () => {
      const observed = ['2018-04-25', '2018-04-26', '2018-04-27'].map(x => DateOnly.fromString(x));
      return expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(
          buildRecurring({
            interval: MONTHLY,
            params: [26],
          }),
          observed,
        );
      }).to.throw("I'm seeing a different schedule for this transaction, please try again.");
    });

    it('should pass with a match', async () => {
      const observed = [moment('2017-01-01'), moment('2017-02-01')].map(DateOnly.fromMoment);
      const rec = buildRecurring({
        interval: MONTHLY,
        params: [1],
      });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2017-02-15'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2017-01-01');
    });

    it('should pass with a match with some fuzziness', async () => {
      const observed = [moment('2017-01-02'), moment('2017-02-02')].map(DateOnly.fromMoment);
      const rec = buildRecurring({ interval: MONTHLY, params: [1] });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2017-02-15'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2017-01-02');
    });

    it('should not match if too fuzzy', async () => {
      const observed = [moment('2017-01-03'), moment('2017-02-03')].map(DateOnly.fromMoment);
      return expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(
          buildRecurring({ interval: MONTHLY, params: [1] }),
          observed,
        );
      }).to.throw("I'm seeing a different schedule for this transaction, please try again.");
    });

    it('should match over weekends with fuzziness', async () => {
      const observed = [
        moment('2017-12-29'),
        moment('2018-01-31'),
        moment('2018-02-28'),
        moment('2018-03-30'),
      ].map(DateOnly.fromMoment);
      const rec = buildRecurring({ interval: MONTHLY, params: [-1] });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2018-04-04'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2017-12-29');
    });

    it('should succeed over weekends thursday payday', async () => {
      const observed = [
        moment('2017-12-28'),
        moment('2018-01-31'),
        moment('2018-02-28'),
        moment('2018-03-29'),
      ].map(DateOnly.fromMoment);
      const res = buildRecurring({ interval: MONTHLY, params: [-1] });
      ValidateRecurring.recursivelyValidateParamsWithObservations(res, observed, {
        today: DateOnly.fromString('2018-04-04'),
      });
      expect(res.rsched.weeklyStart.toString()).to.equal('2018-01-31');
    });

    it('should succeed over weekends with fuzziness monday payday', async () => {
      const observed = [
        moment('2018-01-01'),
        moment('2018-01-31'),
        moment('2018-02-28'),
        moment('2018-04-02'),
      ].map(DateOnly.fromMoment);
      const rec = buildRecurring({ interval: MONTHLY, params: [-1] });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2018-04-04'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2018-01-01');
    });

    it('should succeed over weekends tuesday payday', async () => {
      const observed = [
        moment('2018-01-02'),
        moment('2018-01-31'),
        moment('2018-02-28'),
        moment('2018-04-03'),
      ].map(DateOnly.fromMoment);
      const res = buildRecurring({ interval: MONTHLY, params: [-1] });
      ValidateRecurring.recursivelyValidateParamsWithObservations(res, observed, {
        today: DateOnly.fromString('2018-04-04'),
      });
      expect(res.rsched.weeklyStart.toString()).to.equal('2018-01-31');
    });

    it('should allow a schedule change', async () => {
      const observed = [
        moment('2017-10-22'),
        moment('2017-11-15'),
        moment('2017-12-17'),
        moment('2018-01-01'),
        moment('2018-01-31'),
        moment('2018-02-28'),
        moment('2018-04-02'),
      ].map(DateOnly.fromMoment);
      const rec = buildRecurring({ interval: MONTHLY, params: [-1], rollDirection: 1 });
      ValidateRecurring.recursivelyValidateParamsWithObservations(rec, observed, {
        today: DateOnly.fromString('2018-04-04'),
      });
      expect(rec.rsched.weeklyStart.toString()).to.equal('2017-11-15');
    });

    it('should not allow change 2 periods ago', () => {
      const observed = [moment('2018-01-15'), moment('2018-02-15'), moment('2018-04-02')].map(
        DateOnly.fromMoment,
      );
      return expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(
          buildRecurring({ interval: MONTHLY, params: [-1] }),
          observed,
        );
      }).to.throw("I'm seeing a different schedule for this transaction, please try again.");
    });

    it('should not allow with 2 paychecks and only one match', async () => {
      const observed = [DateOnly.fromString('2018-07-24'), DateOnly.fromString('2018-07-28')];
      expect(() => {
        ValidateRecurring.recursivelyValidateParamsWithObservations(
          buildRecurring({ interval: WEEKLY, params: ['friday'] }),
          observed,
        );
      }).to.throw("I'm seeing a different schedule for this transaction, please try again.");
    });
  });

  describe('sanitizeUserParams', () => {
    it('should set all above 28 to be -1', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [10, 50],
      };
      const result = ValidateRecurring.sanitizeUserInput(params);
      expect(result.params).to.deep.equal([10, -1]);
    });

    it('should throw an error if params are too close', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [3, 50],
      };
      const func = () => ValidateRecurring.sanitizeUserInput(params);
      expect(func).to.throw('Semi Monthly Params must be at least 7 days apart.');
    });

    it('should throw an error if params are too close on the high side', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [28, 50],
      };
      const func = () => ValidateRecurring.sanitizeUserInput(params);
      expect(func).to.throw('Semi Monthly Params must be at least 7 days apart.');
    });

    it('should throw an error if params are too around', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [28, 2],
      };
      const func = () => ValidateRecurring.sanitizeUserInput(params);
      expect(func).to.throw('Semi Monthly Params must be at least 7 days apart.');
    });

    it('should not throw an error if more than 7 days around', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [28, 7],
      };
      const result = ValidateRecurring.sanitizeUserInput(params);
      expect(result.params).to.deep.equal([28, 7]);
    });

    it('should uppercase interval', () => {
      const params = {
        interval: 'semi_monthly',
        params: [28, 7],
      } as any;
      const result = ValidateRecurring.sanitizeUserInput(params);
      expect(result.interval).to.equal(RecurringTransactionInterval.SEMI_MONTHLY);
    });

    it('should throw an error if params are less than -1', () => {
      const params = {
        interval: RecurringTransactionInterval.SEMI_MONTHLY,
        params: [10, -2],
      };
      const func = () => ValidateRecurring.sanitizeUserInput(params);
      expect(func).to.throw('Monthly Params cannot be less than -1');
    });
  });
});
