import * as MatchExpected from '../../../src/domain/recurring-transaction/match-expected-transactions';
import * as sinon from 'sinon';
import { moment, Moment } from '@dave-inc/time-lib';
import { sequelize } from '../../../src/models';
import { Op, QueryTypes } from 'sequelize';
import { expect } from 'chai';
import 'mocha';
import { ExpectedTransaction, RecurringTransaction } from '../../../src/models';
import { ExpectedTransactionStatus } from '../../../src/models/expected-transaction';
import { RSched } from '../../../src/lib/recurring-schedule';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import Notifications from '../../../src/domain/recurring-transaction/notifications';
import * as Store from '../../../src/domain/recurring-transaction/store';
import BankingData from '../../../src/lib/heath-client';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import * as uuid from 'uuid';

describe('RecurringTransactionDomain/match-expected-transactions', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => up());
  //truncate user and user_session data
  afterEach(() => clean(sandbox));

  function createUpdateFake(expecteds: any[]) {
    const idMap = expecteds.reduce((m, expected) => {
      m[expected.id] = expected;
      return m;
    }, {});

    return (id: number, params: any) => {
      if (id in idMap) {
        return Object.assign({}, idMap[id], params);
      }
    };
  }

  describe('_filterAndSortBankTransactions', () => {
    it('should remove any that are the wrong amount sign', async () => {
      const recurring = { userAmount: 200 } as RecurringTransaction;
      const transactions = await Bluebird.map(
        [
          {
            amount: 10,
            transactionDate: moment()
              .subtract(1, 'day')
              .startOf('day')
              .format('YYYY-MM-DD'),
          },
          {
            amount: -10,
            transactionDate: moment()
              .subtract(5, 'day')
              .format('YYYY-MM-DD'),
          },
          {
            amount: 10,
            transactionDate: moment()
              .subtract(2, 'day')
              .format('YYYY-MM-DD'),
          },
          {
            amount: -10,
            transactionDate: moment()
              .subtract(3, 'day')
              .format('YYYY-MM-DD'),
          },
        ],
        data => factory.build('bds-bank-transaction', data),
      );
      const res = MatchExpected._filterAndSortBankTransactions(transactions, recurring);
      expect(res.length).to.equal(2);
      expect(res[0].transactionDate).to.equal(
        moment()
          .subtract(2, 'day')
          .format('YYYY-MM-DD'),
      );
    });

    it('should remove any that are the same day and keep amound closest to expected', async () => {
      const recurring = { userAmount: 200 } as RecurringTransaction;
      const transactions = await Bluebird.map(
        [
          { amount: 101, transactionDate: moment() },
          { amount: -10, transactionDate: moment() },
          { amount: 201, transactionDate: moment() },
          { amount: 198, transactionDate: moment() },
          { amount: 202, transactionDate: moment() },
          { amount: -10, transactionDate: moment() },
        ],
        data => factory.build('bds-bank-transaction', data),
      );
      const res = MatchExpected._filterAndSortBankTransactions(transactions, recurring);
      expect(res.length).to.equal(1);
      expect(res[0].amount).to.equal(201);
    });

    it('should remove any incomes below match threshold', async () => {
      const recurring = { userAmount: 50, type: TransactionType.INCOME } as RecurringTransaction;
      const transactions = await Bluebird.map(
        [
          { id: 0, amount: 2.77, transactionDate: moment() },
          { id: 1, amount: 100.0, transactionDate: moment().subtract(1, 'day') },
        ],
        data => factory.build('bds-bank-transaction', data),
      );
      const res = MatchExpected._filterAndSortBankTransactions(transactions, recurring);
      expect(res.length).to.equal(1);
      expect(res[0].id).to.equal(1);
    });
  });

  describe('_updatePendingExpectedTransactions', () => {
    beforeEach(() => {
      stubBankTransactionClient(sandbox);
    });
    it('should update the pending expected if the bank transaction is not pending', async () => {
      const expected: any = [
        {
          bankAccountId: 10,
          id: 999,
          bankTransactionId: 2,
          status: 'PENDING',
          pendingDate: moment().startOf('day'),
        },
      ];
      const bankTransaction = await factory.create('bank-transaction', {
        bankAccountId: 10,
        transactionDate: moment().ymd(),
        status: 'SETTLED',
        amount: 500,
        id: 2,
        pending: false,
        pendingDisplayName: null,
      });
      const updateStub = sandbox.stub(Store, 'updateExpectedTransaction');
      await MatchExpected._updatePendingExpectedTransactions(expected, {
        bankAccountId: 10,
      } as RecurringTransaction);
      sinon.assert.calledWith(
        updateStub,
        expected[0].id,
        sinon.match({
          bankTransactionId: BigInt(2),
          settledDate: sinon.match((x: Moment) => x.isSame(bankTransaction.transactionDate, 'day')),
          status: 'SETTLED',
          settledAmount: 500,
        }),
      );
    });

    it('should update the pending expected if the bank transaction has a uuid field', async () => {
      const bankTransactionUuid = uuid.v4();
      const bankTransactionId = MatchExpected._getBankTransactionIdFromUuid(bankTransactionUuid);
      const expected: any = [
        {
          bankAccountId: 10,
          id: 999,
          bankTransactionId,
          status: 'PENDING',
          pendingDate: moment(),
        },
      ];
      const bankTransaction = await factory.create('bank-transaction', {
        bankTransactionUuid,
        bankAccountId: 10,
        transactionDate: moment().ymd(),
        status: 'SETTLED',
        amount: 500,
        pending: false,
        pendingDisplayName: null,
      });
      const updateStub = sandbox.stub(Store, 'updateExpectedTransaction');
      await MatchExpected._updatePendingExpectedTransactions(expected, {
        bankAccountId: 10,
      } as RecurringTransaction);
      expect(updateStub.callCount).to.eq(1);
      sinon.assert.calledWith(
        updateStub,
        expected[0].id,
        sinon.match({
          bankTransactionId,
          settledDate: sinon.match((x: Moment) => x.isSame(bankTransaction.transactionDate, 'day')),
          status: 'SETTLED',
          settledAmount: 500,
        }),
      );
    });

    it('should not update a transaction if it is not pending', async () => {
      const expected: any = [{ bankAccountId: 10, bankTransactionId: 2, status: 'PREDICTED' }];
      await factory.create('bank-transaction', {
        bankAccountId: 10,
        transactionDate: moment().ymd(),
        status: 'SETTLED',
        amount: 500,
        id: 2,
        pending: false,
      });
      const updateStub = sandbox.stub(Store, 'updateExpectedTransaction');
      await MatchExpected._updatePendingExpectedTransactions(expected, {
        bankAccountId: 10,
      } as RecurringTransaction);
      sandbox.assert.notCalled(updateStub);
    });

    it('should not update a transaction if the bank transaction id is null', async () => {
      const expected: any = [
        {
          bankAccountId: 10,
          bankTransactionId: null,
          status: 'PENDING',
          pendingDate: moment(),
        },
      ];
      await factory.build('bank-transaction', {
        bankAccountId: 10,
        transactionDate: moment().ymd(),
        status: 'SETTLED',
        amount: 500,
        id: 2,
        pending: false,
      });
      const updateStub = sandbox.stub(Store, 'updateExpectedTransaction');
      await MatchExpected._updatePendingExpectedTransactions(expected, {
        bankAccountId: 10,
      } as RecurringTransaction);
      sandbox.assert.notCalled(updateStub);
    });
  });

  describe('_matchAndUpdateExpectedTransactions', () => {
    it('should update the expected if the date is within 3 days', async () => {
      const stub = sandbox.stub(Store, 'updateExpectedTransaction');
      const expected: any = [
        {
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2018-05-10'),
        },
      ];
      const bankTransaction: any = {
        transactionDate: moment('2018-05-09'),
        status: 'SETTLED',
        amount: 500,
        id: 2,
      };
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction'),
      );
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(bankTransaction.id),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
    });

    it('should correctly set bankTransactinId if the bank transaction has a uuid', async () => {
      const stub = sandbox.stub(Store, 'updateExpectedTransaction');
      const expected: any = [
        {
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2018-05-10'),
        },
      ];
      const bankTransaction: any = {
        transactionDate: moment('2018-05-09'),
        status: 'SETTLED',
        amount: 500,
        bankTransactionUuid: uuid.v4(),
      };
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction'),
      );
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: MatchExpected._getBankTransactionIdFromUuid(
          bankTransaction.bankTransactionUuid,
        ),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
    });

    it('should update the expected if the date is within 4 days when a holiday bumps it', async () => {
      const expected: any = [
        {
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2019-08-30'),
        },
      ];
      const bankTransaction: any = {
        transactionDate: moment('2019-09-03'),
        status: 'SETTLED',
        amount: 500,
        id: 2,
      };
      const updateFake = createUpdateFake(expected);
      const stub = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction'),
      );
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(bankTransaction.id),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
    });

    it('should match the most recent expected if off by more than 3 days', async () => {
      const expected: any = [
        {
          id: 200,
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2019-04-01'),
        },
        {
          id: 201,
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2019-04-15'),
        },
      ];
      const bankTransaction: any = {
        transactionDate: moment('2019-04-10'),
        status: 'SETTLED',
        amount: 500,
        id: 2,
      };
      const updateFake = createUpdateFake(expected);
      const stub = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction', {
          interval: 'semi_monthly',
          params: [1, 15],
        }),
      );
      sandbox.assert.calledOnce(stub);
      expect(stub.firstCall.args[0]).to.equal(201);
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(bankTransaction.id),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
      expect(result[0].id).to.equal(201);
    });

    it('should match the expected that comes after it if off by more than 3 days', async () => {
      const expected: any = [
        {
          id: 200,
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2019-04-01'),
        },
        {
          id: 201,
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment('2019-04-15'),
        },
      ];
      const bankTransaction: any = {
        transactionDate: moment('2019-04-05'),
        status: 'SETTLED',
        amount: 500,
        id: 2,
      };
      const updateFake = createUpdateFake(expected);
      const stub = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction', {
          interval: 'semi_monthly',
          params: [1, 15],
        }),
      );
      sandbox.assert.calledOnce(stub);
      expect(stub.firstCall.args[0]).to.equal(201);
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(bankTransaction.id),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
      expect(result[0].id).to.equal(201);
    });

    it('should filter out exact matches after first check', async () => {
      const expected: any = [
        {
          id: 200,
          bankTransactionId: 2,
          status: 'PENDING',
          expectedDate: moment().subtract(15, 'days'),
        },
        { id: 201, bankTransactionId: 2, status: 'PENDING', expectedDate: moment() },
      ];
      const bankTransaction: any = {
        transactionDate: moment(),
        status: 'SETTLED',
        amount: 500,
        id: 2,
      };
      const updateFake = createUpdateFake(expected);
      const stub = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);
      const result = await MatchExpected._matchAndUpdateExpectedTransactions(
        expected,
        [bankTransaction],
        await factory.build('recurring-transaction', {
          interval: 'weekly',
          params: [
            moment()
              .format('dddd')
              .toLowerCase(),
          ],
        }),
      );
      sandbox.assert.calledOnce(stub);
      expect(stub.firstCall.args[0]).to.equal(201);
      expect(stub.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(bankTransaction.id),
        settledDate: bankTransaction.transactionDate,
        status: 'SETTLED',
        settledAmount: bankTransaction.amount,
      });
      expect(result.length).to.equal(1);
      expect(result[0].expectedDate.isSame(bankTransaction.transactionDate, 'day')).to.be.true;
    });
  });

  describe('shouldUpdateRsched', () => {
    it('should update when settledDate differs from expected', async () => {
      const settledDiff = [
        await factory.create('expected-transaction', {
          expectedDate: moment(),
          settledDate: moment().subtract(3, 'days'),
        }),
      ];
      expect(MatchExpected.shouldUpdateRsched(settledDiff)).to.be.true;
    });

    it('should update when no settledDate exists and pendingDate differs from expected', async () => {
      const pendingDiff = [
        await factory.create('expected-transaction', {
          expectedDate: moment(),
          pendingDate: moment()
            .add(3, 'days')
            .toDate(),
        }),
      ];
      expect(MatchExpected.shouldUpdateRsched(pendingDiff)).to.be.true;
    });

    it('should not update when dates are invalid', async () => {
      const matchedDateless = [
        await factory.create('expected-transaction', {
          expectedDate: moment().startOf('day'),
          settledDate: undefined,
          pendingDate: undefined,
        }),
      ];
      expect(MatchExpected.shouldUpdateRsched(matchedDateless)).to.be.false;
    });

    it('should not update when dates match', async () => {
      const matchedPerfect = [
        await factory.create('expected-transaction', {
          expectedDate: moment().startOf('day'),
          settledDate: moment(),
        }),
        await factory.create('expected-transaction', {
          expectedDate: moment(),
          settledDate: moment(),
        }),
      ];
      expect(MatchExpected.shouldUpdateRsched(matchedPerfect)).to.be.false;
    });
  });

  describe('updateByAccountId', () => {
    it('should update pending, match expected and update recurring', async () => {
      const recurringUpdate = sandbox.stub(Store, 'update');
      const notMatchedId = 200;
      const matchedId = 201;
      const pendingId = 202;
      const expected = [
        {
          id: notMatchedId,
          bankTransactionId: null,
          status: 'PREDICTED',
          expectedDate: moment().subtract(15, 'days'),
          pendingDate: null,
        },
        {
          id: matchedId,
          bankTransactionId: null,
          status: 'PREDICTED',
          expectedDate: moment(),
          pendingDate: null,
        },
        {
          id: pendingId,
          bankTransactionId: 4,
          status: 'PENDING',
          expectedDate: moment(),
          pendingDate: moment().subtract(3, 'day'),
        },
      ];
      const bankTransactions = [
        { transactionDate: moment(), status: 'SETTLED', amount: 500, id: 2 },
      ];
      const pendingQueryTransactions = [
        {
          transactionDate: moment().subtract(2, 'day'),
          status: 'SETTLED',
          amount: 500,
          id: 4,
        },
      ];
      const recurring = {
        id: 99,
        bankAccountId: 5,
        update: recurringUpdate,
        userAmount: 50,
        rsched: new RSched(
          RecurringTransactionInterval.WEEKLY,
          [
            moment()
              .format('dddd')
              .toLowerCase(),
          ],
          1,
        ),
        missed: moment().subtract(7, 'days'),
      };
      sandbox.stub(Store, 'getMatchableByBankAccount').resolves([recurring]);
      sandbox.stub(ExpectedTransaction, 'findAll').resolves(expected);
      sandbox.stub(ExpectedTransaction, 'findOne').resolves(expected[2]);
      sandbox
        .stub(BankingData, 'getBankTransactions')
        .onFirstCall()
        .resolves(pendingQueryTransactions)
        .onSecondCall()
        .resolves(bankTransactions);
      sandbox.stub(Notifications, 'notifyIncomeStatusChange').resolves();
      const updateFake = createUpdateFake(expected);
      const updateExpected = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);

      await MatchExpected.updateByAccountId(100);
      sandbox.assert.calledTwice(updateExpected);
      updateExpected.firstCall.calledWith(pendingId, {
        bankTransactionId: 4,
        settledDate: pendingQueryTransactions[0].transactionDate,
        status: 'SETTLED',
        settledAmount: 500,
      });
      updateExpected.secondCall.calledWith(matchedId, {
        bankTransactionId: 2,
        settledDate: bankTransactions[0].transactionDate,
        status: 'SETTLED',
        settledAmount: 500,
      });
      expect(recurringUpdate.firstCall.args[0]).to.equal(recurring.id);
      expect(recurringUpdate.firstCall.args[1]).to.deep.equal({ missed: null });
    });

    it('should update a previously missed transaction with new data', async () => {
      sandbox.useFakeTimers(new Date(2020, 6, 1));
      sandbox.stub(Notifications, 'notifyIncomeStatusChange').resolves();
      const rsched = new RSched(RecurringTransactionInterval.MONTHLY, [5], 1);
      const recurringUpdate = sandbox.stub(Store, 'update');
      const expected: any[] = [
        {
          id: 1500,
          bankTransactionId: null,
          status: 'PREDICTED',
          expectedDate: rsched.before(moment().subtract(15, 'days')),
        },
      ];
      const bankTransactions = [
        {
          transactionDate: rsched.before(moment().subtract(15, 'days')),
          status: 'SETTLED',
          amount: 500,
          id: 2,
        },
      ];
      const recurring = {
        id: 99,
        bankAccountId: 5,
        update: recurringUpdate,
        userAmount: 50,
        rsched,
        missed: moment().subtract(27, 'days'),
      };
      sandbox.stub(Store, 'getMatchableByBankAccount').resolves([recurring]);
      sandbox.stub(ExpectedTransaction, 'findAll').resolves(expected);
      sandbox.stub(ExpectedTransaction, 'findOne').resolves(expected[2]);
      sandbox.stub(BankingData, 'getBankTransactions').resolves(bankTransactions);
      const updateFake = createUpdateFake(expected);
      const updateExpected = sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);

      await MatchExpected.updateByAccountId(100);
      expect(updateExpected.firstCall.args[0]).to.equal(1500);
      expect(updateExpected.firstCall.args[1]).to.deep.equal({
        bankTransactionId: BigInt(2),
        settledDate: bankTransactions[0].transactionDate,
        status: 'SETTLED',
        settledAmount: 500,
      });
      expect(recurringUpdate.firstCall.args[0]).to.equal(recurring.id);
      expect(recurringUpdate.firstCall.args[1]).to.deep.equal({ missed: null });
    });

    it('should update not validated transactions with a transaction display name', async () => {
      sandbox.useFakeTimers(new Date(2020, 1, 30));
      const recurring = await factory.create('recurring-transaction', {
        userId: 100,
        bankAccountId: 100,
        userAmount: 50,
        interval: RecurringTransactionInterval.MONTHLY,
        params: [5],
        status: 'NOT_VALIDATED',
        missed: moment().subtract(27, 'days'),
      });
      const expected: any[] = [
        {
          id: 200,
          bankTransactionId: null,
          status: 'PREDICTED',
          update: () => {},
          expectedDate: recurring.rsched.before(moment().subtract(15, 'days')),
        },
      ];
      const bankTransactions = [
        {
          transactionDate: recurring.rsched.before(moment().subtract(15, 'days')),
          status: 'SETTLED',
          amount: 500,
          id: 2,
        },
      ];

      sandbox.stub(ExpectedTransaction, 'findAll').resolves(expected);
      sandbox.stub(ExpectedTransaction, 'findOne').resolves(expected[2]);
      sandbox.stub(BankingData, 'getBankTransactions').resolves(bankTransactions);
      const updateFake = createUpdateFake(expected);
      sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);

      await MatchExpected.updateByAccountId(100);
      await recurring.reload();
      expect(recurring.missed).to.be.null;
    });

    [true, false].forEach(shouldUseReplica => {
      it(`should forward read replica flag ${shouldUseReplica} to Heath`, async () => {
        const recurringUpdate = sandbox.stub(Store, 'update');
        const matchedId = 201;
        const pendingId = 202;
        const expected = [
          {
            id: matchedId,
            bankTransactionId: null,
            status: 'PREDICTED',
            expectedDate: moment(),
            pendingDate: null,
          },
          {
            id: pendingId,
            bankTransactionId: 4,
            status: 'PENDING',
            expectedDate: moment(),
            pendingDate: moment().subtract(2, 'day'),
          },
        ];
        const bankTransactions = [
          { transactionDate: moment(), status: 'SETTLED', amount: 500, id: 2 },
        ];
        const pendingQueryTransactions = [
          {
            transactionDate: moment().subtract(2, 'day'),
            status: 'SETTLED',
            amount: 500,
            id: 4,
          },
        ];
        const recurring = {
          id: 99,
          bankAccountId: 5,
          update: recurringUpdate,
          userAmount: 50,
          rsched: new RSched(
            RecurringTransactionInterval.WEEKLY,
            [
              moment()
                .format('dddd')
                .toLowerCase(),
            ],
            1,
          ),
          missed: moment().subtract(7, 'days'),
        };
        sandbox.stub(Store, 'getMatchableByBankAccount').resolves([recurring]);
        sandbox.stub(ExpectedTransaction, 'findAll').resolves(expected);
        sandbox.stub(ExpectedTransaction, 'findOne').resolves(expected[2]);
        const getBtStub = sandbox
          .stub(BankingData, 'getBankTransactions')
          .onFirstCall()
          .resolves(pendingQueryTransactions)
          .onSecondCall()
          .resolves(bankTransactions);
        sandbox.stub(Notifications, 'notifyIncomeStatusChange').resolves();
        const updateFake = createUpdateFake(expected);
        sandbox.stub(Store, 'updateExpectedTransaction').callsFake(updateFake);

        await MatchExpected.updateByAccountId(100, 'test-api', shouldUseReplica);

        sandbox.assert.calledTwice(getBtStub);
        const singleBtOptions = getBtStub.firstCall.args[2];
        expect(singleBtOptions.useReadReplica).to.equal(shouldUseReplica);

        const getBtOptions = getBtStub.secondCall.args[2];
        expect(getBtOptions.useReadReplica).to.equal(shouldUseReplica);
      });
    });
  });

  describe('updateByAccountId', () => {
    beforeEach(() => {
      stubBankTransactionClient(sandbox);
    });
    it('should use the recurring transactions display name', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'weekly',
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findByPk(ex.id);
      expect(result.status).to.equal('SETTLED');
    });

    it('should use the recurring transactions pending display name', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        pendingDisplayName: 'Pending Name 100',
        userAmount: -50,
        interval: 'biweekly',
        dtstart: moment().subtract(3, 'days'),
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: true,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findByPk(ex.id);
      expect(result.status).to.equal('PENDING');
    });

    it('should leave room to match for long holiday weekends', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        pendingDisplayName: 'Pending Name 100',
        userAmount: -50,
        interval: 'biweekly',
        dtstart: moment('2019-10-02'),
        status: RecurringTransactionStatus.VALID,
        params: ['wednesday'],
        userDisplayName: 'Test User Supplied',
        created: moment('2019-10-02'),
      });
      // Monday 2019-10-14 is Columbus day. 10-09 plus settlement
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment('2019-10-09'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Pending Name 100',
        amount: -50,
        transactionDate: '2019-10-15',
        pending: true,
      });
      await MatchExpected.updateByAccountId(108, null, false, moment('2019-10-08'));
      const result = await ExpectedTransaction.findByPk(ex.id);
      expect(result.status).to.equal('PENDING');
    });

    it('should match an expected transaction a few days in the future', async () => {
      sandbox.useFakeTimers(moment('2020-03-16').unix() * 1000);
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'bacon',
        userAmount: -50,
        interval: RecurringTransactionInterval.BIWEEKLY,
        dtstart: moment('2020-03-04'),
        status: RecurringTransactionStatus.VALID,
        params: ['wednesday'],
        userDisplayName: 'Test User Supplied',
        created: moment('2020-03-04'),
      });
      // Monday 2019-10-14 is Columbus day. 10-09 plus settlement
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment('2020-03-18'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'bacon',
        amount: -50,
        transactionDate: '2020-03-16',
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findByPk(ex.id);
      expect(result.status).to.equal('SETTLED');
    });

    it('should not match an expected transaction too far in the future', async () => {
      sandbox.useFakeTimers(moment('2020-03-16').unix() * 1000);
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'bacon',
        userAmount: -50,
        interval: RecurringTransactionInterval.BIWEEKLY,
        dtstart: moment('2020-03-06'),
        status: RecurringTransactionStatus.VALID,
        params: ['wednesday'],
        userDisplayName: 'Test User Supplied',
        created: moment('2020-03-06'),
      });
      // Monday 2019-10-14 is Columbus day. 10-09 plus settlement
      const ex = await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment('2020-03-20'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'bacon',
        amount: -50,
        transactionDate: '2020-03-16',
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findByPk(ex.id);
      expect(result.status).to.equal('PREDICTED');
    });

    it('should match multiple expected transactions at once', async () => {
      sandbox.useFakeTimers(moment('2020-07-17').unix() * 1000);
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'mind on my money',
        userAmount: 500,
        interval: RecurringTransactionInterval.BIWEEKLY,
        status: RecurringTransactionStatus.VALID,
        params: ['friday'],
        userDisplayName: 'money on my mind',
        created: moment('2020-07-03'),
      });
      const ex0 = await ExpectedTransaction.create({
        userId: rec.userId,
        bankAccountId: rec.bankAccountId,
        displayName: rec.transactionDisplayName,
        expectedAmount: rec.userAmount,
        status: 'PREDICTED',
        expectedDate: moment('2020-07-03'),
        recurringTransactionId: rec.id,
      });
      const ex1 = await ExpectedTransaction.create({
        userId: rec.userId,
        bankAccountId: rec.bankAccountId,
        displayName: rec.transactionDisplayName,
        expectedAmount: rec.userAmount,
        status: 'PREDICTED',
        expectedDate: moment('2020-07-17'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: rec.userId,
        bankAccountId: rec.bankAccountId,
        externalId: 'bacon',
        displayName: rec.transactionDisplayName,
        amount: rec.userAmount,
        transactionDate: '2020-07-03',
      });
      await factory.create('bank-transaction', {
        userId: rec.userId,
        bankAccountId: rec.bankAccountId,
        externalId: 'bacon 2',
        displayName: rec.transactionDisplayName,
        amount: rec.userAmount,
        transactionDate: '2020-07-17',
      });
      await MatchExpected.updateByAccountId(108);
      const result0 = await ExpectedTransaction.findByPk(ex0.id);
      expect(result0.status).to.equal('SETTLED');
      const result1 = await ExpectedTransaction.findByPk(ex1.id);
      expect(result1.status).to.equal('SETTLED');
    });

    it('should create a new expected transaction if we need to', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        status: RecurringTransactionStatus.VALID,
        interval: 'MONTHLY',
        params: [moment().date() > 28 ? 28 : moment().date()],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      const bt = await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findOne({
        where: {
          recurringTransactionId: rec.id,
          settledDate: bt.transactionDate,
        },
        order: [['expectedDate', 'DESC']],
      });
      expect(result).to.exist;
      expect(result.status).to.equal('SETTLED');
    });

    it('should not generate old expected transactions', async () => {
      sandbox.useFakeTimers(moment('2020-07-15').unix() * 1000);
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'MONTHLY',
        status: RecurringTransactionStatus.VALID,
        params: [15],
        userDisplayName: 'Test User Supplied',
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        expectedDate: moment('2020-07-05'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const results = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results.length).to.equal(3);
      expect(results[0].expectedDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(10, 'days')
          .format('YYYY-MM-DD'),
      );
      expect(results[2].expectedDate.isSameOrAfter(moment())).to.be.true;
      expect(results[2].status).to.equal(ExpectedTransactionStatus.PREDICTED);
    });

    it('should only generate 1 expected transaction when no match', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'MONTHLY',
        status: RecurringTransactionStatus.VALID,
        params: [moment().date() > 28 ? 28 : moment().date()],
        userDisplayName: 'Test User Supplied',
      });
      const results1 = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results1.length).to.equal(0);
      await MatchExpected.updateByAccountId(108);
      const results = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results.length).to.equal(1);
      expect(results[0].expectedDate.format('YYYY-MM-DD')).to.equal(
        moment().date() > 28
          ? moment()
              .date(28)
              .format('YYYY-MM-DD')
          : moment().format('YYYY-MM-DD'),
      );
    });

    it('should not generate any expected transactions if the oldest one is in the future', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'MONTHLY',
        status: RecurringTransactionStatus.VALID,
        params: [moment().date() > 28 ? 28 : moment().date()],
        userDisplayName: 'Test User Supplied',
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().add(10, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const results = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results.length).to.equal(1);
      expect(results[0].expectedDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .add(10, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should generate a future expected transaction if matched', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'MONTHLY',
        status: RecurringTransactionStatus.VALID,
        params: [moment().date() > 28 ? 28 : moment().date()],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(7, 'days'),
      });
      const bt = await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        displayName: rec.transactionDisplayName,
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      const results1 = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results1.length).to.equal(0);
      await MatchExpected.updateByAccountId(108);
      const results = await ExpectedTransaction.findAll({
        where: {
          recurringTransactionId: rec.id,
        },
        order: [['expectedDate', 'ASC']],
      });
      expect(results.length).to.equal(2);
      expect(results[0].settledDate.isSame(bt.transactionDate, 'day')).to.be.true;
      expect(results[1].settledDate).to.not.exist;
    });

    it('should update the schedule if off', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'WEEKLY',
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(1, 'day')
            .format('dddd')
            .toLowerCase(),
        ],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-2',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment(moment().subtract(14, 'day')).ymd(),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-1',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment(moment().subtract(7, 'day')).ymd(),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const newRec = await RecurringTransaction.findByPk(rec.id);
      expect(newRec.params).not.to.deep.equal(rec.params);
      expect(newRec.interval).to.equal('WEEKLY');
    });

    it('should unlink old expected transactions if schedule is off', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: 50,
        interval: 'WEEKLY',
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(1, 'day')
            .format('dddd')
            .toLowerCase(),
        ],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-2',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment(moment().subtract(14, 'day')).ymd(),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-1',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment(moment().subtract(7, 'day')).ymd(),
        pending: false,
      });
      const bt = await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findOne({
        where: {
          recurringTransactionId: rec.id,
          settledDate: bt.transactionDate,
        },
        order: [['expectedDate', 'DESC']],
        paranoid: false,
      });
      expect(result).to.exist;
      expect(result.status).to.equal('SETTLED');
    });

    it('should unlink recent expected if the schedule is off', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: 50,
        interval: 'WEEKLY',
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(1, 'day')
            .format('dddd')
            .toLowerCase(),
        ],
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-2',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment(moment().subtract(14, 'day')).ymd(),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon-1',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment(moment().subtract(7, 'day')).ymd(),
        pending: false,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await ExpectedTransaction.findOne({
        where: {
          recurringTransactionId: rec.id,
          deleted: {
            [Op.ne]: null,
          },
        },
        order: [['expectedDate', 'DESC']],
        paranoid: false,
      });
      expect(result.expectedDate.format('YYYY-MM-DD')).to.equal(
        moment()
          .subtract(1, 'days')
          .format('YYYY-MM-DD'),
      );
    });

    it('should clear a missed status from recurring transaction if a transaction came in', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'weekly',
        rollDirection: -1,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        missed: moment(),
        status: RecurringTransactionStatus.VALID,
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });
      await MatchExpected.updateByAccountId(108);
      const result = await RecurringTransaction.findByPk(rec.id);

      expect(result.missed).to.be.null;
    });

    it('should not clear a missed status from recurring transaction if an old transaction came in', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'weekly',
        rollDirection: -1,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        missed: moment(),
        status: RecurringTransactionStatus.VALID,
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(10, 'days'),
        recurringTransactionId: rec.id,
      });
      await sequelize.query(
        `INSERT INTO bank_transaction (id,
                                           user_id,
                                           bank_account_id,
                                           external_id,
                                           external_name,
                                           display_name,
                                           amount,
                                           transaction_date,
                                           pending)
             VALUES (12111, 100, 108, 'bacon', 'Test', 'Name 100', -50, DATE_SUB(CURRENT_DATE, INTERVAL  10 DAY), false)`,
      );
      await MatchExpected.updateByAccountId(108);
      const result = await RecurringTransaction.findByPk(rec.id);

      expect(result.missed).to.not.be.null;
    });

    it('should send notification when clearing missed status from income', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: 50,
        interval: 'weekly',
        rollDirection: -1,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        missed: moment(),
        status: RecurringTransactionStatus.VALID,
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: 50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: 50,
        transactionDate: moment().ymd(),
        pending: false,
      });

      const notificationsStub = sandbox.stub(Notifications, 'notifyIncomeStatusChange');
      await MatchExpected.updateByAccountId(rec.bankAccountId);

      sinon.assert.calledOnce(notificationsStub);
      const args = notificationsStub.getCall(0).args;
      expect(args[1]).to.equal(RecurringTransactionStatus.VALID);
      expect(args[2]).to.equal(RecurringTransactionStatus.MISSED);
    });

    it('should not send notification when clearing missed status from expense', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'weekly',
        rollDirection: -1,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        missed: moment(),
        status: RecurringTransactionStatus.VALID,
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
      });

      const notificationsStub = sandbox.stub(Notifications, 'notifyIncomeStatusChange');
      await MatchExpected.updateByAccountId(rec.bankAccountId);

      sinon.assert.notCalled(notificationsStub);
    });

    it('should update pending_display_name if available', async () => {
      const rec = await RecurringTransaction.create({
        bankAccountId: 108,
        userId: 100,
        transactionDisplayName: 'Name 100',
        userAmount: -50,
        interval: 'weekly',
        status: RecurringTransactionStatus.VALID,
        params: [
          moment()
            .subtract(3, 'days')
            .format('dddd')
            .toLowerCase(),
        ],
        missed: null,
        userDisplayName: 'Test User Supplied',
        created: moment().subtract(1, 'month'),
      });
      await ExpectedTransaction.create({
        userId: 100,
        bankAccountId: 108,
        pendingDisplayName: 'Test',
        displayName: 'Test User Supplied',
        expectedAmount: -50,
        status: 'PREDICTED',
        expectedDate: moment().subtract(3, 'days'),
        recurringTransactionId: rec.id,
      });
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
        pendingDisplayName: 'Test Pending',
      });
      await MatchExpected.updateByAccountId(108);
      const result = await RecurringTransaction.findByPk(rec.id);

      expect(result.pendingDisplayName).to.equal('Test Pending');
    });

    it('should not update pending_display_name if it is null', async () => {
      await sequelize.query(
        "UPDATE recurring_transaction SET pending_display_name = 'Pending' WHERE id = 100",
      );
      await sequelize.query(
        `INSERT INTO expected_transaction (id,
                                             user_id,
                                             bank_account_id,
                                             pending_display_name,
                                             display_name,
                                             expected_date,
                                             expected_amount,
                                             status,
                                             recurring_transaction_id)
           VALUES (143, 100, 108, null, 'Test', CURRENT_DATE, 300, 'PREDICTED', 100)`,
      );
      await factory.create('bank-transaction', {
        userId: 100,
        bankAccountId: 108,
        externalId: 'bacon',
        externalName: 'Test',
        displayName: 'Name 100',
        amount: -50,
        transactionDate: moment().ymd(),
        pending: false,
        pendingDisplayName: 'Test Pending',
      });
      await MatchExpected.updateByAccountId(108);
      const [result]: any[] = await sequelize.query(
        'SELECT * from recurring_transaction WHERE id = 100',
        {
          type: QueryTypes.SELECT,
        },
      );
      expect(result.pending_display_name).to.equal('Pending');
    });
  });

  describe('shouldClearMissedStatus', () => {
    afterEach(() => sandbox.restore());

    it('should return true when recent expected transaction has match', async () => {
      sandbox.useFakeTimers(moment('2020-06-01').unix() * 1000);

      const rt = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['monday'],
        missed: moment('2020-05-10'),
      });
      const matched = [
        {
          expectedDate: moment('2020-05-25'),
        },
      ] as ExpectedTransaction[];

      expect(MatchExpected.shouldClearMissedStatus(rt, matched)).to.be.true;
    });

    it('should return true when expected transaction settled recently', async () => {
      sandbox.useFakeTimers(moment('2020-06-01').unix() * 1000);

      const rt = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['monday'],
        missed: moment('2020-05-10'),
      });
      const matched = [
        {
          expectedDate: moment('2020-05-20'),
          settledDate: moment('2020-05-25'),
        },
      ] as ExpectedTransaction[];

      expect(MatchExpected.shouldClearMissedStatus(rt, matched)).to.be.true;
    });

    it('should return false when expected transaction is old', async () => {
      sandbox.useFakeTimers(moment('2020-06-01').unix() * 1000);

      const rt = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['monday'],
        missed: moment('2020-05-10'),
      });
      const matched = [
        {
          expectedDate: moment('2020-05-15'),
        },
      ] as ExpectedTransaction[];

      expect(MatchExpected.shouldClearMissedStatus(rt, matched)).to.be.false;
    });

    it('should consider interval duration for match recency ', async () => {
      sandbox.useFakeTimers(moment('2020-06-01').unix() * 1000);

      const rtWeekly = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.WEEKLY,
        params: ['monday'],
        missed: moment('2020-04-10'),
      });

      const rtMonthly = await factory.build('recurring-transaction', {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [8],
        missed: moment('2020-04-10'),
      });

      const matched = [
        {
          expectedDate: moment('2020-05-15'),
        },
      ] as ExpectedTransaction[];

      expect(MatchExpected.shouldClearMissedStatus(rtWeekly, matched)).to.be.false;
      expect(MatchExpected.shouldClearMissedStatus(rtMonthly, matched)).to.be.true;
    });
  });

  describe('expectedRecurringTransactionWindow', () => {
    it('should generate a start and end date search window', async () => {
      const date = moment('2019-12-10');
      const weeklySched = new RSched(RecurringTransactionInterval.WEEKLY, ['tuesday'], -1);
      const dateRange = MatchExpected.expectedRecurringTransactionWindow(date, weeklySched);
      expect(dateRange.start.isSame(moment('2019-12-06'), 'day')).to.be.true;
      expect(dateRange.end.isSame(moment('2019-12-13'), 'day')).to.be.true;
    });

    it('should generate end dates that roll over weekends', async () => {
      const date = moment('2019-12-11');
      const weeklySched = new RSched(RecurringTransactionInterval.WEEKLY, ['wednesday'], 1);
      const dateRange = MatchExpected.expectedRecurringTransactionWindow(date, weeklySched);
      expect(dateRange.start.isSame(moment('2019-12-09'), 'day')).to.be.true;
      // 3 day settlement grace period puts end date on Saturday 2019-12-14
      // without roll forward
      expect(dateRange.end.isSame(moment('2019-12-16'), 'day')).to.be.true;
    });

    it('should generate end dates that roll over holidays', async () => {
      const date = moment('2019-12-25');
      const semiMonthlySched = new RSched(RecurringTransactionInterval.SEMI_MONTHLY, [10, 25], 1);
      const dateRange = MatchExpected.expectedRecurringTransactionWindow(date, semiMonthlySched);
      expect(dateRange.start.isSame(moment('2019-12-13'), 'day')).to.be.true;
      expect(dateRange.end.isSame(moment('2019-12-30'), 'day')).to.be.true;
    });
  });
});
