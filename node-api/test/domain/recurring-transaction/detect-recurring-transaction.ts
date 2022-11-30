import * as Bluebird from 'bluebird';
import {
  addUndetectedRecurringTransaction,
  detectRecurringTransactions,
  getSingleTransactionPossibleRecurringIncome,
  setInitialIncomeDetectionRequired,
  markInitialIncomeDetectionComplete,
  isInitialIncomeDetectionActive,
} from '../../../src/domain/recurring-transaction/detect-recurring-transaction';
import * as FindPossibleRecurringTransactions from '../../../src/domain/recurring-transaction/find-possible-recurring-transactions';
import { AuditLog, BankAccount, MerchantInfo } from '../../../src/models';
import { moment } from '@dave-inc/time-lib';
import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import { nextBankingDay } from '../../../src/lib/banking-days';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import * as Create from '../../../src/domain/recurring-transaction/create-recurring-transaction';
import * as Store from '../../../src/domain/recurring-transaction/store';
import * as Events from '../../../src/domain/recurring-transaction/events';
import * as MatchScoreExperiment from '../../../src/domain/recurring-transaction/experiments/match-score-experiment';
import stubBankTransactionClient, {
  upsertBankTransactionForStubs,
} from '../../test-helpers/stub-bank-transaction-client';
import Counter from '../../../src/lib/counter';

describe('RecurringTransactionDomain/detect', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    sandbox.stub(Counter.prototype, 'getValue').resolves(0);
    sandbox.stub(Counter.prototype, 'increment');
    stubBankTransactionClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  describe('detectPaychecks', () => {
    it('should return all possible paychecks for a user and detect the schedules', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const currentDate = '2019-10-25';
      const dates = [
        moment(currentDate).subtract(7, 'days'),
        moment(currentDate),
        moment(currentDate).subtract(14, 'days'),
      ].map(d => nextBankingDay(d, -1));
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });
      const [transaction] = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.INCOME,
        moment(currentDate),
      );
      expect(transaction.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(transaction.params[0]).to.equal(
        moment(currentDate)
          .format('dddd')
          .toLowerCase(),
      );
      expect(transaction.rollDirection).to.equal(-1);
      expect(transaction.displayName).to.equal(displayName);
      expect(transaction.bankTransactionId).to.not.be.undefined;
    });

    it('should not return expenses', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')].map(d =>
        nextBankingDay(d, -1),
      );
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: -100,
          pending: false,
        });
      });
      const transactions = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.INCOME,
      );
      expect(transactions.length).to.equal(0);
    });

    it('should not return incomes with uncertain pay schedules', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [
        moment().subtract(13, 'days'),
        moment().subtract(54, 'days'),
        moment().subtract(85, 'days'),
      ];
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });
      await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.INCOME,
      ).should.eventually.have.lengthOf(0);
    });
  });

  describe('detect expenses', () => {
    it('should return all possible expenses for a user and detect the schedules', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const currentDate = '2019-10-25';
      const dates = [
        moment(currentDate).subtract(7, 'days'),
        moment(currentDate),
        moment(currentDate).subtract(14, 'days'),
      ].map(d => nextBankingDay(d, -1));
      await Bluebird.map(dates, (date, index) => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD') + `-${index}`,
          externalName: displayName,
          amount: -100,
          pending: false,
        });
      });
      const [transaction] = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.EXPENSE,
        moment(currentDate).add(1, 'day'),
      );
      expect(transaction.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(transaction.params[0]).to.equal(
        moment(currentDate)
          .format('dddd')
          .toLowerCase(),
      );
      expect(transaction.rollDirection).to.equal(-1);
      expect(transaction.displayName).to.equal(displayName);
      expect(transaction.bankTransactionId).to.not.be.undefined;
    });

    it('should attach plaidCategory from most recent transaction to result', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];
      let count = 0;
      await Bluebird.each(dates, date => {
        count += 1;
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: -100,
          pending: false,
          plaidCategory: ['CATEGORY' + count, 'SUBCATEGORY' + count],
        });
      });

      const merchantInfo = MerchantInfo.build({ categoryImage: 'categoryImage' });
      const merchantInfoStub = sandbox.stub(MerchantInfo, 'getMerchantInfo').resolves(merchantInfo);

      const [transaction] = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.EXPENSE,
      );

      expect(merchantInfoStub).to.have.been.calledWith('DISPLAY NAME', 'CATEGORY3', 'SUBCATEGORY3');
      expect(transaction.merchantInfo).to.deep.equal(merchantInfo.serialize());
    });

    const categoryTests: Array<{ category: string; subCategory: string; result: boolean }> = [
      { category: 'Travel', subCategory: 'Pelican Rides', result: false },
      { category: 'Definitely Not Travel', subCategory: 'Pelican Rides', result: true },
      { category: 'Bank Fees', subCategory: 'Insufficient Funds', result: false },
      { category: 'Bank Fees', subCategory: 'Luxury Tax', result: true },
    ];

    categoryTests.forEach((testParams: any) => {
      it(`should not return invalid Plaid expense categories (${testParams.category}, ${testParams.subCategory})`, async () => {
        const bankAccount = await factory.create('checking-account');
        const displayName = 'DISPLAY NAME';
        const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];

        await Bluebird.each(dates, date => {
          return factory.create('bank-transaction', {
            bankAccountId: bankAccount.id,
            userId: bankAccount.id,
            transactionDate: date,
            displayName,
            externalId: date.format('YYYY-MM-DD'),
            externalName: displayName,
            amount: -100,
            pending: false,
            plaidCategory: [testParams.category, testParams.subCategory],
          });
        });

        const transactions = await detectRecurringTransactions(
          bankAccount.id,
          TransactionType.EXPENSE,
        );

        expect(transactions.length).to.equal(testParams.result ? 1 : 0);
      });

      it(`should not return invalid Plaid income categories (${testParams.category}, ${testParams.subCategory})`, async () => {
        const bankAccount = await factory.create('checking-account');
        const displayName = 'DISPLAY NAME';
        const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];

        await Bluebird.each(dates, date => {
          return factory.create('bank-transaction', {
            bankAccountId: bankAccount.id,
            userId: bankAccount.id,
            transactionDate: date,
            displayName,
            externalId: date.format('YYYY-MM-DD'),
            externalName: displayName,
            amount: 100,
            pending: false,
            plaidCategory: [testParams.category, testParams.subCategory],
          });
        });

        const transactions = await detectRecurringTransactions(
          bankAccount.id,
          TransactionType.INCOME,
        );

        expect(transactions.length).to.equal(1);
      });
    });

    it('should not return incomes', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });
      const transactions = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.EXPENSE,
      );
      expect(transactions.length).to.equal(0);
    });

    it('might not find schedule for some incomes and will not return them', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [
        moment().subtract(13, 'days'),
        moment().subtract(54, 'days'),
        moment().subtract(85, 'days'),
      ];
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: -100,
          pending: false,
        });
      });
      const displayName2 = 'DISPLAY NAME BACON';
      const dates2 = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];
      await Bluebird.map(dates2, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName: displayName2,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName2,
          amount: -100,
          pending: false,
        });
      });
      const transactions = await detectRecurringTransactions(
        bankAccount.id,
        TransactionType.EXPENSE,
      );
      expect(transactions.length).to.equal(1);
      const [transaction] = transactions;
      expect(transaction.displayName).to.equal(displayName2);
    });
  });

  describe('detect new recurring income', () => {
    beforeEach(async () => {
      sandbox.stub(Events, 'publishNewRecurringTransaction').resolves(null);
    });
    after(() => clean(sandbox));

    async function createSeries(
      displayName: string,
      bankAccount: BankAccount,
      amount: number = 100,
      dates = [moment().subtract(14, 'days'), moment().subtract(7, 'days'), moment()],
    ) {
      return Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.userId,
          transactionDate: date.ymd(),
          displayName,
          externalName: displayName,
          amount,
          pending: false,
        });
      });
    }

    it('should detect new recurring income for user', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'pay me';
      await createSeries(displayName, bankAccount);

      const [recurringTransaction] = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      expect(recurringTransaction).to.exist;
      expect(recurringTransaction.bankAccountId).to.equal(bankAccount.id);
      expect(recurringTransaction.transactionDisplayName).to.equal(displayName);
    });

    it('should not add existing recurring transactions for user', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'pay me';
      await createSeries(displayName, bankAccount);

      const [recurringTransaction] = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      expect(recurringTransaction).to.exist;
      expect(recurringTransaction.bankAccountId).to.equal(bankAccount.id);
      expect(recurringTransaction.transactionDisplayName).to.equal(displayName);

      // try to re-add to make sure it's not detected again
      const secondAttempt = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );
      expect(secondAttempt).to.be.empty;
    });

    it('should not detect deleted recurring transactions for user', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'pay me';
      await createSeries(displayName, bankAccount);

      const [recurringTransaction] = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      expect(recurringTransaction).to.exist;
      expect(recurringTransaction.bankAccountId).to.equal(bankAccount.id);
      expect(recurringTransaction.transactionDisplayName).to.equal(displayName);

      // now delete, and then try to re-add to make sure it's not detected again
      await Store.deleteById(recurringTransaction.id);
      const resultAfterDelete = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );
      expect(resultAfterDelete).to.be.empty;
    });

    it('recurring transactions should match the interval filter', async () => {
      const bankAccount = await factory.create('checking-account');
      await createSeries('weekly series name', bankAccount, -100, [
        moment().subtract(14, 'days'),
        moment().subtract(7, 'days'),
        moment(),
      ]);
      await createSeries('biweekly series', bankAccount, -75, [
        moment().subtract(28, 'days'),
        moment().subtract(14, 'days'),
        moment(),
      ]);
      await createSeries('monthly series', bankAccount, -25, [
        moment()
          .subtract(2, 'months')
          .set('date', 15),
        moment()
          .subtract(1, 'months')
          .set('date', 15),
        moment().set('date', 15),
      ]);

      const recurringTrxns = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.EXPENSE,
        { filterInterval: RecurringTransactionInterval.MONTHLY },
      );

      expect(recurringTrxns).to.exist;
      expect(recurringTrxns.length).to.equal(1);
      expect(recurringTrxns[0].rsched).to.exist;
      expect(recurringTrxns[0].rsched.interval).to.equal(RecurringTransactionInterval.MONTHLY);
    });

    it('should persist detected income to the DB', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'pay me';
      await createSeries(displayName, bankAccount);

      await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      const stored = await Store.getByUserAndType(bankAccount.userId, TransactionType.INCOME);
      expect(stored.length).to.equal(1);
      expect(stored[0].transactionDisplayName).to.equal(displayName);
    });

    it('should create audit log for each new income', async () => {
      const bankAccount = await factory.create('checking-account');
      await createSeries('foo', bankAccount);
      await createSeries('bar', bankAccount);

      const newIncomes = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      expect(newIncomes.length).to.equal(2);
      await Bluebird.map(newIncomes, async newIncome => {
        const auditLog = await AuditLog.findOne({
          where: {
            userId: newIncome.userId,
            eventUuid: newIncome.id,
          },
        });
        expect(auditLog).to.exist;
        expect(auditLog.extra).to.exist;
        expect(auditLog.extra.confidence).to.exist;
        expect(auditLog.extra.matchScore).to.exist;
        expect(auditLog.extra.matchScoreExperiment).to.exist;
      });
    });

    it('should omit new invalid name recurring income', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'atm deposit';
      await createSeries(displayName, bankAccount);

      const results = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      expect(results.length).to.equal(0);
    });

    it('should omit new recurring incomes that fail validation', async () => {
      const bankAccount = await factory.create('checking-account');
      const validName = 'pay me';
      const invalidName = 'invalid';
      await createSeries(validName, bankAccount);
      await createSeries(invalidName, bankAccount);

      const origValidate = Create.buildAndValidate;
      const validateStub = sandbox.stub(Create, 'buildAndValidate').callsFake(params => {
        if (params.transactionDisplayName === invalidName) {
          throw new Error('stub error');
        } else {
          return origValidate(params);
        }
      });

      const results = await addUndetectedRecurringTransaction(
        bankAccount.userId,
        bankAccount,
        TransactionType.INCOME,
      );

      sandbox.assert.calledTwice(validateStub);
      expect(results.length).to.equal(1);
      expect(results[0].transactionDisplayName).to.equal(validName);
    });

    describe('match confidence filtering', () => {
      function stubExperiment(stubbedResult: MatchScoreExperiment.EXPERIMENT_CASE) {
        sandbox.stub(MatchScoreExperiment, 'runMatchScoreExperiment').returns({
          filter: MatchScoreExperiment.FILTERS[stubbedResult],
          experimentCase: stubbedResult,
        });
      }

      async function stubPossibleTransactions(
        bankAccount: BankAccount,
        matchScore: number,
        confidence: number,
      ) {
        await createSeries('payday', bankAccount);

        sandbox
          .stub(FindPossibleRecurringTransactions, 'findPossibleRecurringTransactions')
          .resolves([
            {
              transactions: [],
              scheduleMatch: {
                confidence,
                matchScore,
              },
              recurringParams: {
                bankAccountId: bankAccount.id,
                interval: 'WEEKLY',
                params: ['tuesday'],
                rollDirection: 0,
                userAmount: 100,
                userDisplayName: 'payday',
                transactionDisplayName: 'payday',
              },
            },
          ]);
      }

      beforeEach(() => {
        sandbox
          .stub(Create, 'buildAndValidate')
          .callsFake(params =>
            Create.build({ ...params, status: RecurringTransactionStatus.VALID }),
          );
      });

      context('for standard confidence filter', () => {
        beforeEach(() => stubExperiment(MatchScoreExperiment.EXPERIMENT_CASE.CONTROL));

        it('includes matches above 90 confidence', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0, 95);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(1);
        });

        it('excludes matches below 90 confidence', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0, 85);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(0);
        });
      });

      context('for match score filter', () => {
        beforeEach(() =>
          stubExperiment(MatchScoreExperiment.EXPERIMENT_CASE.MATCH_SCORE_V2_THRESHOLD_75),
        );

        it('includes matches above .75 match score', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0.8, 0);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(1);
        });

        it('excludes matches below .75 match score', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0.7, 0);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(0);
        });
      });

      context('for experimental confidence filter', () => {
        beforeEach(() =>
          stubExperiment(MatchScoreExperiment.EXPERIMENT_CASE.CONFIDENCE_THRESHOLD_75),
        );

        it('includes matches above 75 confidence', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0, 80);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(1);
        });

        it('excludes matches below 75 confidence', async () => {
          const bankAccount = await factory.create('checking-account');
          await stubPossibleTransactions(bankAccount, 0, 70);

          const newIncomes = await addUndetectedRecurringTransaction(
            bankAccount.userId,
            bankAccount,
            TransactionType.INCOME,
          );

          expect(newIncomes.length).to.equal(0);
        });
      });
    });
  });

  describe('getSingleTransactionPossibleRecurringIncome', () => {
    it('should return response for each bank transaction', async () => {
      const bankAccount = await factory.create('bank-account');
      const bt0 = await factory.build('bank-transaction', {
        amount: 1000,
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: 'cash rules everything around me',
        transactionDate: moment().ymd(),
      });
      const bt1 = await factory.build('bank-transaction', {
        amount: 500,
        bankAccountId: bankAccount.id,
        userId: bankAccount.userId,
        displayName: "dollah dollah bill y'all",
        transactionDate: moment().ymd(),
      });

      const bts = [bt0, bt1];
      sandbox.stub(BankAccount, 'findByPk').resolves(bankAccount);
      bts.forEach(b => upsertBankTransactionForStubs(b));
      const results = await getSingleTransactionPossibleRecurringIncome(bankAccount.id);

      expect(results.length).to.equal(2);

      results.forEach((result, idx) => {
        expect(result.bankAccountId).to.equal(bankAccount.id);
        expect(result.bankTransactionId).to.equal(bts[idx].id);
        expect(result.amount).to.equal(bts[idx].amount);
        expect(result.displayName).to.equal(bts[idx].displayName);
        expect(result.foundSchedule).to.equal(false);
        expect(result.interval).to.equal(RecurringTransactionInterval.MONTHLY);
      });
    });
  });

  describe('initial income detection status', () => {
    after(() => clean());

    it('should set initial detection required flag', async () => {
      await setInitialIncomeDetectionRequired(9894);
      const isActive = await isInitialIncomeDetectionActive(9894, moment());
      expect(isActive).to.be.true;
    });

    it('should clear active status', async () => {
      await setInitialIncomeDetectionRequired(9894);
      await markInitialIncomeDetectionComplete(9894);
      const isActive = await isInitialIncomeDetectionActive(9894, moment());
      expect(isActive).to.be.false;
    });

    it('should never indicate active after 6 hours', async () => {
      await setInitialIncomeDetectionRequired(9895);
      const isActive = await isInitialIncomeDetectionActive(9895, moment().subtract(7, 'hour'));
      expect(isActive).to.be.false;
    });

    it('should indicate active if no status set in first 6 hours', async () => {
      const isActive = await isInitialIncomeDetectionActive(9896, moment());
      expect(isActive).to.be.true;
    });
  });
});
