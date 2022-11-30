import { BankTransaction as DBBankTransaction } from '../../../../src/models';
import * as BankingData from '../../../../src/services/heath/domain';
import { BankTransaction, SortOrder } from '@dave-inc/heath-client';
import factory from '../../../factories';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import { pick } from 'lodash';
import { clean } from '../../../test-helpers';
import { moment } from '@dave-inc/time-lib';
import { Moment } from 'moment';
import { createTransactions } from '../../../test-helpers/create-transaction';

describe('Banking Data Service Bank Transaction Client', () => {
  before(() => clean());
  describe('createTransactions', () => {
    it('should create multiple transaction in the Database', async () => {
      const transactions = await Bluebird.map([1, 2, 3], async i => {
        return await factory.build<BankTransaction>('bds-bank-transaction', {
          externalId: `external-${i}`,
        });
      });
      await BankingData.createBankTransactions(transactions);

      const found = await DBBankTransaction.findAll({
        where: {
          externalId: transactions.map(t => t.externalId),
        },
        order: [['externalId', 'ASC']],
      });
      expect(found.length).to.eq(transactions.length);
      const fieldsToCompare = [
        'bankAccountId',
        'userId',
        'externalId',
        'pendingExternalName',
        'pendingDisplayName',
        'externalName',
        'displayName',
        'amount',
        'pending',
        'plaidCategory',
        'plaidCategoryId',
        'merchantInfoId',
      ];
      found.forEach(f => {
        const expected = transactions.find(t => t.externalId === f.externalId);
        expect(expected.transactionDate).to.eq(f.transactionDate.format('YYYY-MM-DD'));
        expect(pick(f, fieldsToCompare)).to.deep.equal(pick(expected, fieldsToCompare));
      });
    });
  });

  describe('getSingleBankTransaction', () => {
    let bankTransaction: BankTransaction;
    before(async () => {
      bankTransaction = await factory.build<BankTransaction>('bds-bank-transaction');
      await createTransactions([bankTransaction]);
    });
    it('should return a single most recent bank transaction', async () => {
      const secondTransaction = await factory.build<BankTransaction>('bds-bank-transaction', {
        amount: bankTransaction.amount,
        bankAccountId: bankTransaction.bankAccountId,
        transactionDate: moment(bankTransaction.transactionDate)
          .add(1, 'day')
          .format('YYYY-MM-DD'),
      });
      await createTransactions([secondTransaction]);
      const transaction = await BankingData.getSingleBankTransaction(
        bankTransaction.bankAccountId,
        {
          amount: bankTransaction.amount,
        },
      );
      expect(transaction.externalId).to.eq(secondTransaction.externalId);
    });
  });

  describe('getBankTransactions', () => {
    let bankAccountId: number;
    let allTransactions: BankTransaction[];
    const startDate = moment('2020-01-01');
    const endDate = moment('2020-02-01');
    const range = moment.range(startDate, endDate).by('day');

    before(async () => {
      const { id } = await factory.create('bank-account');
      bankAccountId = id;
      allTransactions = await Bluebird.map(Array.from(range), transactionDate => {
        return factory.build<BankTransaction>('bds-bank-transaction', {
          transactionDate: transactionDate.format('YYYY-MM-DD'),
          bankAccountId,
        });
      });
      await createTransactions(allTransactions);
    });

    context('with pending and non-pending transactions', () => {
      const NUMBER_PENDING_TRANS = 4;

      before(async () => {
        await clean();
        allTransactions = [];
        const rangeArray = Array.from(range);

        for (let i = 0; i < rangeArray.length; i++) {
          const transactionDate = rangeArray[i];

          const transaction = await factory.build<BankTransaction>('bds-bank-transaction', {
            transactionDate: transactionDate.format('YYYY-MM-DD'),
            updated: transactionDate.format(),
            bankAccountId,
            pending: i < NUMBER_PENDING_TRANS,
          });

          allTransactions.push(transaction);
        }

        await createTransactions(allTransactions);
      });

      it('should support multiple sort orders if provided', async () => {
        const transactions = await BankingData.getBankTransactions(
          bankAccountId,
          {},
          {
            order: { status: SortOrder.DESC, updated: SortOrder.DESC },
          },
        );

        expect(transactions.length).to.eq(allTransactions.length);

        let newestDate: Moment;
        let iteration = 0;

        for (const trans of transactions) {
          // The first X number of transactions should be pending as we are sorting by that first
          if (iteration < NUMBER_PENDING_TRANS) {
            expect(trans.pending).to.be.true;
          } else if (iteration === NUMBER_PENDING_TRANS) {
            newestDate = moment(trans.updated); // Mark the oldest date is the first non-pending transaction as they should be supported in order after this date
          } else {
            expect(moment(trans.updated).isBefore(newestDate, 'day')).to.be.true;
            newestDate = moment(trans.updated);
          }

          iteration++;
        }
      });
    });

    it('should get all transactions in descending order with no options', async () => {
      const transactions = await BankingData.getBankTransactions(bankAccountId);
      expect(transactions.length).to.eq(allTransactions.length);
      let oldestDate: Moment = moment();
      for (const trans of transactions) {
        expect(moment(trans.transactionDate).isBefore(oldestDate, 'day')).to.be.true;
        oldestDate = moment(trans.transactionDate);
      }
    });

    it('should change the sort order if provided', async () => {
      const transactions = await BankingData.getBankTransactions(
        bankAccountId,
        {},
        {
          order: { transactionDate: SortOrder.ASC },
        },
      );
      expect(transactions.length).to.eq(allTransactions.length);
      let oldestDate: Moment = moment(startDate).subtract(1, 'day');
      for (const trans of transactions) {
        expect(moment(trans.transactionDate).isAfter(oldestDate, 'day')).to.be.true;
        oldestDate = moment(trans.transactionDate);
      }
    });

    it('should limit to 1 if provided', async () => {
      const transactions = await BankingData.getBankTransactions(bankAccountId, {}, { limit: 1 });
      expect(transactions.length).to.eq(1);
      expect(moment(transactions[0].transactionDate).isSame(endDate, 'day')).to.be.true;
    });

    it('should get a single date with maxDate and endDate set', async () => {
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        transactionDate: {
          gte: endDate.ymd(),
          lte: endDate.ymd(),
        },
      });
      expect(transactions.length).to.eq(1);
      expect(moment(transactions[0].transactionDate).isSame(endDate, 'day')).to.be.true;
    });

    it('should get all transaction between 2 dates', async () => {
      const minDate = moment(endDate).subtract(10, 'days');
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        transactionDate: {
          gte: minDate.ymd(),
          lte: endDate.ymd(),
        },
      });
      expect(transactions.length).to.eq(11);
      expect(moment(transactions[10].transactionDate).isSame(minDate, 'day')).to.be.true;
    });

    it('should get all transaction between at specific dates', async () => {
      const minDate = moment(endDate).subtract(10, 'days');
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        transactionDate: minDate.ymd(),
      });
      expect(transactions.length).to.eq(1);
      expect(moment(transactions[0].transactionDate).isSame(minDate, 'day')).to.be.true;
    });

    it('should get by amount if provided', async () => {
      const first = allTransactions[0];
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        amount: first.amount,
      });
      expect(transactions.length).to.be.gte(1);
      const found = transactions.find(t => t.externalId === first.externalId);
      expect(found).not.to.be.null;
    });

    it('should search by multiple amounts if provided', async () => {
      const first2 = allTransactions.slice(0, 2);
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        amount: first2.map(t => t.amount),
      });
      expect(transactions.length).to.eq(2);
      const found = transactions.filter(t => first2.map(f => f.externalId).includes(t.externalId));
      expect(found.length).to.eq(2);
    });

    it('should use a like query', async () => {
      const first = allTransactions[0];
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        displayName: { like: first.displayName.split(' ')[0] + '%' },
      });
      expect(transactions.length).to.be.gte(1);
      const found = transactions.find(t => t.externalId === first.externalId);
      expect(found).not.to.be.null;
    });

    it('should use an exact query', async () => {
      const last = allTransactions[allTransactions.length - 1];
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        displayName: { like: last.displayName },
      });
      expect(transactions.length).to.be.gte(1);
      const found = transactions.find(t => t.externalId === last.externalId);
      expect(found).not.to.be.null;
    });

    it('should correctly do a combination query of amount and time', async () => {
      const last = allTransactions[allTransactions.length - 1];
      const first = allTransactions[0];
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        or: [{ amount: last.amount }, { amount: first.amount }],
        transactionDate: { gt: first.transactionDate },
      });
      expect(transactions.length).to.be.gte(1);
      const found = transactions.find(t => t.externalId === last.externalId);
      expect(found).not.to.be.null;
      const foundFirst = transactions.find(t => t.externalId === first.externalId);
      expect(foundFirst).to.be.undefined;
    });

    it('should correctly do a combination query of amount and displayName and time', async () => {
      const last = allTransactions[allTransactions.length - 1];
      const first = allTransactions[0];
      const transactions = await BankingData.getBankTransactions(bankAccountId, {
        amount: last.amount,
        transactionDate: { gt: first.transactionDate },
        displayName: { like: last.displayName },
      });
      expect(transactions.length).to.eq(1);
      const found = transactions[0];
      expect(found).not.to.be.null;
    });
  });
});
