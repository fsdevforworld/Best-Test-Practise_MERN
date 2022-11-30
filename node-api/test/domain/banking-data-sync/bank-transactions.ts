import { BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import { syncBankTransactions } from '../../../src/domain/banking-data-sync/bank-transactions';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import plaidClient from '../../../src/lib/plaid';
import { BankAccount, BankConnection, BankTransaction } from '../../../src/models';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import { expect } from 'chai';
import 'mocha';
import * as RecurringTransactionJobs from '../../../src/domain/recurring-transaction/jobs';
import { Op } from 'sequelize';
import { BankingDataSyncSource } from '../../../src/typings';

describe('banking-data-sync/bank-transactions', () => {
  const sandbox = sinon.createSandbox();

  let updateExpectedTransactionsStub: sinon.SinonStub;

  before(async () => {
    await clean();
    await BankTransaction.destroy({
      where: { id: { [Op.gte]: 0 } },
    });
  });

  beforeEach(async () => {
    await up();
    updateExpectedTransactionsStub = sandbox.stub(
      RecurringTransactionJobs,
      'createUpdateExpectedTransactionsTask',
    );
  });

  afterEach(() => clean(sandbox));

  context('adding new bank tranasactions', async () => {
    let bankAccount: BankAccount;
    let transaction: BankTransaction;
    const rawTransaction = {
      externalId: 'external-id-1',
      // bankAccountExternalId: bankAccount.externalId,
      amount: -20.01,
      transactionDate: moment('2018-12-21'),
      pending: false,
      externalName: '',
      address: '123 South St',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90066',
      plaidCategory: ['Food and Drink', 'Restaurants'],
      plaidCategoryId: '1111',
      referenceNumber: 'ref-id-1',
      ppdId: 'ppd-id-1',
      payeeName: 'David',
    } as any;
    const transactionSyncPayload = {
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [rawTransaction],
    };

    beforeEach(async () => {
      bankAccount = await factory.create('bank-account', {
        externalId: 'baz-bop',
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
      });

      rawTransaction.bankAccountExternalId = bankAccount.externalId;

      await factory.create(
        'merchant-info',
        { name: 'mendo farms', displayName: 'Mendo Farms' },
        { tokenString: ['mendo farms'], category: 'Food and Drink', subCategory: 'Restaurants' },
      );
    });

    it('adds new bank transactions', async () => {
      await syncBankTransactions(transactionSyncPayload);

      transaction = await BankTransaction.findOne({ where: { externalId: 'external-id-1' } });

      expect(transaction.bankAccountId, 'bankAccountId').to.equal(bankAccount.id);
      expect(transaction.userId, 'userId').to.equal(bankAccount.userId);
      expect(transaction.amount, 'amount').to.equal(-20.01);
      expect(transaction.transactionDate.format('YYYY-MM-DD'), 'transactionDate').to.equal(
        '2018-12-21',
      );
      expect(transaction.pending, 'pending').to.equal(false);
      expect(transaction.accountType, 'accountType').to.equal(bankAccount.type);
      expect(transaction.accountSubtype, 'accountSubtype').to.equal(bankAccount.subtype);
      expect(transaction.plaidCategoryId).to.equal('1111');
    });

    it('does not default to a merchantInfoId of 1 if externalName is not empty', async () => {
      rawTransaction.externalName = 'Mendo Farms';

      await syncBankTransactions(transactionSyncPayload);

      transaction = await BankTransaction.findOne({ where: { externalId: 'external-id-1' } });

      expect(transaction.merchantInfoId).to.not.equal(1);
    });

    it('does not default to a merchantInfoId of 1 even if externalName is pending', async () => {
      rawTransaction.externalName = 'Mendo Farms';
      rawTransaction.pending = true;

      await syncBankTransactions(transactionSyncPayload);

      transaction = await BankTransaction.findOne({ where: { externalId: 'external-id-1' } });

      expect(transaction.merchantInfoId).to.not.equal(1);
    });

    it('defaults to a merchantInfoId of 1 if externalName is empty', async () => {
      rawTransaction.externalName = '';

      await syncBankTransactions(transactionSyncPayload);

      transaction = await BankTransaction.findOne({ where: { externalId: 'external-id-1' } });

      expect(transaction.merchantInfoId).to.equal(1);
    });
  });

  it('updates existing bank transactions', async () => {
    const bankAccount = await factory.create('bank-account', {
      externalId: 'baz-bop',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });

    let bankTransaction = await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      externalId: 'fake-trans-1',
      transactionDate: moment('2018-12-21'),
      plaidCategory: ['Travel'],
    });

    await syncBankTransactions({
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [
        {
          externalId: bankTransaction.externalId,
          bankAccountExternalId: bankAccount.externalId,
          amount: -20.01,
          transactionDate: moment('2018-12-23'),
          pending: false,
          externalName: 'Mendo Farms',
          address: '123 South St',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90066',
          plaidCategory: ['Food and Drink'],
          plaidCategoryId: '1111',
          referenceNumber: 'ref-id-1',
          ppdId: 'ppd-id-1',
          payeeName: 'David',
        },
      ],
    });

    bankTransaction = await BankTransaction.findByPk(bankTransaction.id);

    expect(bankTransaction.plaidCategory[0]).to.equal('Food and Drink');
    expect(bankTransaction.externalName).to.equal('Mendo Farms');
    expect(bankTransaction.amount).to.equal(-20.01);
    expect(bankTransaction.transactionDate.format('YYYY-MM-DD')).to.equal('2018-12-23');
  });

  it('will not call update if nothing has changed', async () => {
    const bankAccount = await factory.create('bank-account', {
      externalId: 'baz-bop',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });

    const bankTransaction = await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      externalId: 'fake-trans-1',
      transactionDate: moment('2018-12-21'),
      plaidCategory: ['Travel'],
    });

    const upsertStub = sandbox.stub(BankTransaction, 'bulkInsertAndRetry');

    await syncBankTransactions({
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [
        {
          externalId: bankTransaction.externalId,
          bankAccountExternalId: bankAccount.externalId,
          amount: bankTransaction.amount,
          transactionDate: bankTransaction.transactionDate,
          pending: bankTransaction.pending,
          externalName: bankTransaction.externalName,
          address: bankTransaction.address,
          city: bankTransaction.city,
          state: bankTransaction.state,
          zipCode: bankTransaction.zipCode,
          plaidCategory: bankTransaction.plaidCategory,
          plaidCategoryId: bankTransaction.plaidCategoryId,
          referenceNumber: bankTransaction.referenceNumber,
          ppdId: bankTransaction.ppdId,
          payeeName: bankTransaction.payeeName,
        },
      ],
    });

    sinon.assert.calledWith(upsertStub, []);
  });

  it('migrates pending transactions to settled', async () => {
    const bankAccount = await factory.create('bank-account', {
      externalId: 'baz-bop',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });

    let bankTransaction = await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      externalId: 'fake-trans-1',
      pending: true,
      displayName: 'Airplane Food',
      pendingDisplayName: 'Airplane Food',
      pendingExternalName: 'Airplane Food',
      transactionDate: '2018-12-21',
    });

    await syncBankTransactions({
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [
        {
          externalId: 'something-different',
          pendingExternalId: bankTransaction.externalId,
          bankAccountExternalId: bankAccount.externalId,
          amount: -20.01,
          transactionDate: moment('2018-12-21'),
          pending: false,
          externalName: 'Mendocino Farms BAC#12345',
        },
      ],
    });

    bankTransaction = await BankTransaction.findByPk(bankTransaction.id);

    expect(bankTransaction.pending).to.equal(false);
    expect(bankTransaction.displayName).to.equal('Mendocino Farms');
    expect(bankTransaction.externalName).to.equal('Mendocino Farms BAC#12345');
    expect(bankTransaction.pendingDisplayName).to.equal('Airplane Food');
  });

  // check case where pending transaction can't be found

  // do we still need the redis case?

  it('removes deleted transactions', async () => {
    const bankAccount = await factory.create('bank-account', {
      externalId: 'baz-bop',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });

    const bankTransaction = await factory.create('bank-transaction', {
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
      externalId: 'fake-trans-1',
      transactionDate: '2018-12-21',
    });

    await syncBankTransactions({
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [
        {
          externalId: 'something-different',
          bankAccountExternalId: bankAccount.externalId,
          amount: -20.01,
          transactionDate: moment('2018-12-21'),
          pending: false,
          externalName: 'Mendocino Farms',
        },
      ],
    });

    const updatedTransaction = await BankTransaction.findByPk(bankTransaction.id);

    expect(updatedTransaction).to.equal(null);
  });

  it('handles transactions from multiple bank accounts', async () => {
    const bankAccount = await factory.create('bank-account', {
      externalId: 'baz-bop',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
    });
    const bankAccount2 = await factory.create('bank-account', {
      externalId: 'baz-boppy-boo',
      type: BankAccountType.Depository,
      subtype: BankAccountSubtype.Checking,
      bankConnectionId: bankAccount.bankConnectionId,
      userId: bankAccount.userId,
    });
    const bankTransaction = await factory.create('bank-transaction', {
      bankAccountId: bankAccount2.id,
      userId: bankAccount2.userId,
      transactionDate: '2018-12-21',
      externalId: 'fake-trans-1',
      plaidCategory: ['Travel'],
    });

    await syncBankTransactions({
      startDate: '2018-12-21',
      endDate: '2018-12-22',
      data: [
        {
          externalId: 'external-id-1',
          bankAccountExternalId: bankAccount.externalId,
          amount: -20.01,
          transactionDate: moment('2018-12-21'),
          pending: false,
          externalName: 'Mendo Farms',
          address: '123 South St',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90066',
          plaidCategory: ['Food and Drink'],
          plaidCategoryId: '1111',
          referenceNumber: 'ref-id-1',
          ppdId: 'ppd-id-1',
          payeeName: 'David',
        },
        {
          externalId: bankTransaction.externalId,
          bankAccountExternalId: bankAccount2.externalId,
          amount: -20.01,
          transactionDate: moment('2018-12-21'),
          pending: false,
          externalName: 'Mendo Farms',
          address: '123 South St',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90066',
          plaidCategory: ['Food and Drink'],
          plaidCategoryId: '1111',
          referenceNumber: 'ref-id-1',
          ppdId: 'ppd-id-1',
          payeeName: 'David',
        },
      ],
    });

    const createdTransaction = await BankTransaction.findOne({
      where: { externalId: 'external-id-1' },
    });

    expect(createdTransaction.bankAccountId, 'bankAccountId').to.equal(bankAccount.id);
    expect(createdTransaction.userId, 'userId').to.equal(bankAccount.userId);
    expect(createdTransaction.amount, 'amount').to.equal(-20.01);

    const updatedTransaction = await BankTransaction.findByPk(bankTransaction.id);

    expect(updatedTransaction.plaidCategory[0]).to.equal('Food and Drink');
    expect(updatedTransaction.externalName).to.equal('Mendo Farms');
  });

  it('throws an error when a bank account does not exist', async () => {
    await expect(
      syncBankTransactions({
        startDate: '2018-12-21',
        endDate: '2018-12-22',
        data: [
          {
            externalId: 'external-id-1',
            bankAccountExternalId: 'this-is-a-bad-id',
            amount: -20.01,
            transactionDate: moment('2018-12-21'),
            pending: false,
            externalName: 'Mendo Farms',
            address: '123 South St',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90066',
            plaidCategory: ['Food and Drink'],
            plaidCategoryId: '1111',
            referenceNumber: 'ref-id-1',
            ppdId: 'ppd-id-1',
            payeeName: 'David',
          },
        ],
      }),
    ).to.rejectedWith('Bank account not found with id: this-is-a-bad-id');
  });

  describe('fetchAndSyncBankTransactions', () => {
    it('handles multiple pages of transactions', async () => {
      const bankConnection = await factory.create('bank-connection');
      const bankAccount = await factory.create('checking-account', {
        bankConnectionId: bankConnection.id,
        userId: bankConnection.userId,
      });

      const transactionsStub = sandbox.stub(plaidClient, 'getTransactions');

      transactionsStub.onCall(0).resolves({
        total_transactions: 3,
        transactions: [
          {
            transaction_id: '1',
            account_id: bankAccount.externalId,
            name: 'Plaid Transaction',
            amount: 100,
            date: '2017-05-01',
            pending: true,
            location: {
              address: '123 foo',
              city: 'Los Fdsfgs',
              zip_code: '90213',
            },
            category_id: 'Grocery',
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Mike Jones',
            },
          },
        ],
      });

      transactionsStub.onCall(1).resolves({
        total_transactions: 2,
        transactions: [
          {
            transaction_id: '2',
            account_id: bankAccount.externalId,
            name: 'Plaid Transaction 2',
            amount: 200,
            date: '2017-04-01',
            pending: false,
            location: {
              address: '123 foo',
              city: 'Los Fdsfgs',
              zip_code: '90213',
            },
            category_id: 'Grocery',
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Kanye West',
            },
          },
          {
            transaction_id: '3',
            account_id: bankAccount.externalId,
            name: 'Plaid Transaction',
            amount: 100,
            date: '2017-05-01',
            pending: true,
            location: {
              address: '123 foo',
              city: 'Los Fdsfgs',
              zip_code: '90213',
            },
            category_id: 'Grocery',
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Harold Jones',
            },
          },
        ],
      });

      await BankingDataSync.fetchAndSyncBankTransactions(bankConnection, {
        historical: true,
      });

      sinon.assert.calledTwice(transactionsStub);
      sinon.assert.called(updateExpectedTransactionsStub);

      const transactions = await BankTransaction.findAll({
        where: {
          bankAccountId: bankAccount.id,
        },
      });

      expect(transactions.length).to.equal(3);
    });

    it('should create an audit log during plaid update for bank transactions', async () => {
      const uid = 2300;
      const spy = sandbox.spy(BankConnectionUpdate, 'create');
      sandbox.stub(plaidClient, 'getTransactions').resolves({
        total_transactions: 2,
        transactions: [
          {
            transaction_id: '2300',
            account_id: 'external_account_2300',
            name: 'Plaid Transaction',
            amount: 100,
            date: '2017-05-01',
            pending: true,
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              zip_code: '90213',
            },
            category_id: 'Grocery',
            payment_meta: {
              reference_number: 1234,
              ppd_id: 1234,
              payee: 'Dave DaBear',
            },
          },
          {
            transaction_id: '2301',
            account_id: 'external_account_2300',
            name: 'Plaid Transaction',
            amount: 100,
            date: '2018-02-01',
            pending: true,
            location: {
              address: '123 bar',
              city: 'Santa Monica',
              zip_code: '90213',
            },
            category_id: 'Restuarant',
            payment_meta: {
              reference_number: 1234,
              ppd_id: 1234,
              payee: 'Dave DaBear',
            },
          },
        ],
      });

      const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
      await BankingDataSync.fetchAndSyncBankTransactions(connection, { historical: true });

      expect(spy.callCount).to.eq(1);
      const log = spy.firstCall.args[0];
      expect(log.type).to.equal('PLAID_UPDATE_TRANSACTIONS');
      expect(log.extra.totalTransactions).to.equal(2);
      expect(log.extra.oldestTransactionDate).to.equal('2017-05-01');
    });

    context('creating new expected transaction job', () => {
      beforeEach(() => {
        const transactionDate = moment().date(1);
        sandbox.stub(plaidClient, 'getTransactions').resolves({
          total_transactions: 2,
          transactions: [
            {
              transaction_id: '2300',
              account_id: 'external_account_2300',
              name: 'Plaid Transaction',
              amount: -100,
              date: transactionDate.format('YYYY-MM-DD'),
              pending: false,
              location: {
                address: '123 foo',
                city: 'Los Angeles',
                zip_code: '90213',
              },
              category_id: 'Grocery',
              payment_meta: {
                reference_number: 1234,
                ppd_id: 1234,
                payee: 'Dave DaBear',
              },
            },
          ],
        });
      });

      it('should not use read replica for historical=true', async () => {
        const uid = 2300;

        const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
        await BankingDataSync.fetchAndSyncBankTransactions(connection, {
          historical: true,
          source: BankingDataSyncSource.PlaidUpdater,
        });
        expect(updateExpectedTransactionsStub.callCount).to.eq(1);
        expect(updateExpectedTransactionsStub.firstCall.args[0]).to.deep.eq({
          bankConnectionId: connection.id,
          source: BankingDataSyncSource.PlaidUpdater,
          canUseReadReplica: false,
        });
      });

      it('should not use read replica for initialPull=true', async () => {
        const uid = 2300;

        const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
        await BankingDataSync.fetchAndSyncBankTransactions(connection, {
          initialPull: true,
          source: BankingDataSyncSource.PlaidUpdater,
        });
        expect(updateExpectedTransactionsStub.callCount).to.eq(1);
        expect(updateExpectedTransactionsStub.firstCall.args[0]).to.deep.eq({
          bankConnectionId: connection.id,
          source: BankingDataSyncSource.PlaidUpdater,
          canUseReadReplica: false,
        });
      });

      it('should not use read replica for source=UserRefresh', async () => {
        const uid = 2300;

        const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
        await BankingDataSync.fetchAndSyncBankTransactions(connection, {
          source: BankingDataSyncSource.UserRefresh,
        });
        expect(updateExpectedTransactionsStub.callCount).to.eq(1);
        expect(updateExpectedTransactionsStub.firstCall.args[0]).to.deep.eq({
          bankConnectionId: connection.id,
          source: BankingDataSyncSource.UserRefresh,
          canUseReadReplica: false,
        });
      });
    });

    it('should update with pending from database if available', async () => {
      const uid = 2300;
      const pendingTransactionId = '3400';
      const originalBankTransaction = await factory.create('bank-transaction', {
        externalId: pendingTransactionId,
        externalName: 'wow money',
        displayName: 'wow money',
        pendingExternalName: 'wow money pending',
        pendingDisplayName: 'wow money pending',
        bankAccountId: 2300,
        transactionDate: moment()
          .subtract(3, 'month')
          .format('YYYY-MM-DD'),
        userId: 2300,
        amount: 1000,
        pending: true,
      });
      sandbox.stub(plaidClient, 'getTransactions').resolves({
        total_transactions: 2,
        transactions: [
          {
            transaction_id: '2300',
            account_id: 'external_account_2300',
            name: 'Plaid Transaction',
            amount: 100,
            date: '2017-05-01',
            pending: false,
            location: {
              address: '123 foo',
              city: 'Los Angeles',
              zip_code: '90213',
            },
            category_id: 'Grocery',
            pending_transaction_id: pendingTransactionId,
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Dave DaBear',
            },
          },
          {
            transaction_id: '2301',
            account_id: 'external_account_2300',
            name: 'New Plaid Transaction',
            amount: 100,
            date: '2018-02-01',
            pending: false,
            location: {
              address: '123 bar',
              city: 'Santa Monica',
              zip_code: '90213',
            },
            category_id: 'Restuarant',
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Dave DaBear',
            },
          },
        ],
      });

      const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
      await BankingDataSync.fetchAndSyncBankTransactions(connection, { historical: true });
      const transaction = await BankTransaction.findOne({ where: { externalId: '2300' } });
      expect(transaction.displayName).to.equal('Plaid Transaction');
      expect(transaction.externalName).to.equal('Plaid Transaction');
      expect(transaction.pendingDisplayName).to.equal('wow money pending');
      expect(transaction.pendingExternalName).to.equal('wow money pending');
      expect(transaction.id).to.equal(originalBankTransaction.id);
    });

    it('should delete any no longer used transactions', async () => {
      const uid = 2300;
      const bt = await factory.create('bank-transaction', {
        externalName: 'wow money',
        pendingExternalName: 'wow money pending',
        bankAccountId: 2300,
        transactionDate: moment()
          .subtract(3, 'months')
          .format('YYYY-MM-DD'),
        userId: 2300,
        amount: 1000,
        pending: true,
      });

      sandbox.stub(plaidClient, 'getTransactions').resolves({
        total_transactions: 1,
        transactions: [
          {
            transaction_id: '2301',
            account_id: 'external_account_2300',
            name: 'Plaid Transaction',
            amount: 100,
            date: moment()
              .subtract(2, 'months')
              .format('YYYY-MM-DD'),
            pending: false,
            location: {
              address: '123 bar',
              city: 'Santa Monica',
              zip_code: '90213',
            },
            category_id: 'Restuarant',
            payment_meta: {
              reference_number: 'abcd',
              ppd_id: 'efgh',
              payee: 'Dave DaBear',
            },
          },
        ],
      });

      const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
      await BankingDataSync.fetchAndSyncBankTransactions(connection, { historical: true });
      const transaction = await BankTransaction.findOne({ where: { externalId: bt.externalId } });
      // tslint:disable-next-line:no-unused-expression
      expect(transaction).to.not.exist;
    });

    it('should make sure the pending display name does not change after an upsert', async () => {
      let transaction = await factory.create('bank-transaction', {
        externalId: '123',
        externalName: 'wow money',
        displayName: 'wow money',
        pendingExternalName: 'wow pending external',
        pendingDisplayName: 'wow pending display',
        bankAccountId: 2300,
        transactionDate: moment('2018-12-12'),
        userId: 2300,
        amount: 1000,
        pending: true,
      });

      expect(transaction.pendingDisplayName).to.equal('wow pending display');
      expect(transaction.pendingExternalName).to.equal('wow pending external');

      await BankTransaction.bulkInsertAndRetry([
        {
          externalId: '123',
          externalName: 'wow money',
          bankAccountId: 2300,
          transactionDate: moment('2018-12-12'),
          userId: 2300,
          amount: 1000,
          pending: true,
        },
      ]);

      transaction = await BankTransaction.findByPk(transaction.id);
      expect(transaction.pendingDisplayName).to.equal('wow pending display');
      expect(transaction.pendingExternalName).to.equal('wow pending external');
    });

    it('should create an audit log if zero transactions are found during plaid update', async () => {
      const uid = 2300;
      const createSpy = sandbox.spy(BankConnectionUpdate, 'create');
      sandbox.stub(plaidClient, 'getTransactions').resolves({
        total_transactions: 0,
        transactions: [],
      });

      const connection = await BankConnection.getOneByExternalId(`external_connection_${uid}`);
      await BankingDataSync.fetchAndSyncBankTransactions(connection, { historical: true });
      expect(createSpy.callCount).to.eq(1);
      expect(createSpy.firstCall.args[0].type).to.eq('PLAID_UPDATE_TRANSACTIONS_NOT_FOUND');
      expect(createSpy.firstCall.args[0].bankConnectionId).to.eq(connection.id);
    });
  });
});
