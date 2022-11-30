import { PlaidErrorCode } from '../../../src/typings';
import factory from '../../factories';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { expect } from 'chai';
import * as AccountAndRouting from '../../../src/domain/banking-data-sync/account-and-routing';
import { ConflictError, CUSTOM_ERROR_CODES, InvalidParametersError } from '../../../src/lib/error';
import { BankAccount, BankConnection } from '../../../src/models';
import * as Bluebird from 'bluebird';
import { MicroDeposit } from '@dave-inc/wire-typings';
import { clean } from '../../test-helpers';
import * as sinon from 'sinon';
import * as plaid from 'plaid';
import User from '../../../src/models/user';
import PubSub from '../../../src/lib/pubsub';
import Plaid from '../../../src/lib/plaid';
import {
  findOneAndHandleSoftDeletes,
  handleExternalIdChanges,
} from '../../../src/domain/banking-data-sync/bank-accounts';
import AuditLog from '../../../src/models/audit-log';
import PlaidTransaction from '../../factories/plaid-transaction';
import { moment } from '@dave-inc/time-lib';
import * as RecurringTransactionJobs from '../../../src/domain/recurring-transaction/jobs';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import SynapsepayNode from '../../../src/domain/synapsepay/node';

describe('banking-data-sync/bank-accounts', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let authStub: sinon.SinonStub;
  const plaidAccounts = [
    {
      account_id: '1',
      mask: '1111',
      name: 'Plaid Account 1',
      balances: {
        current: 100,
        available: 200,
      },
      type: 'depository',
      subtype: 'checking',
    },
    {
      account_id: '2',
      mask: '1112',
      name: 'Plaid Account 2',
      balances: {
        current: 300,
        available: 400,
      },
      type: 'depository',
      subtype: 'checking',
    },
  ];

  let deleteSynapsePayNodeStub: sinon.SinonStub;
  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    deleteSynapsePayNodeStub = sandbox.stub(SynapsepayNode, 'deleteSynapsePayNode').resolves();
    sandbox.stub(RecurringTransactionJobs, 'createUpdateExpectedTransactionsTask');
    sandbox.stub(PubSub, 'publish');
    sandbox.stub(plaid.Client.prototype, 'getAccounts').resolves({ accounts: plaidAccounts });
    authStub = sandbox.stub(plaid.Client.prototype, 'getAuth').resolves({
      accounts: plaidAccounts,
      numbers: {
        ach: [
          {
            account_id: '1',
            account: '101',
            routing: '12345678',
          },
          {
            account_id: '2',
            account: '103',
            routing: '123456799',
          },
        ],
      },
    });
  });

  afterEach(() => clean(sandbox));

  describe('addAccountAndRoutingToAccounts', () => {
    it('should still succeed if one get auth fails and institution is PNC', async () => {
      authStub.rejects({ error_code: PlaidErrorCode.InstitutionNotResponding });
      await factory.create('institution', { id: 7 });
      const connection = await factory.create('bank-connection', { institutionId: 7 });
      const upserted = await BankingDataSync.upsertBankAccounts(connection);
      await BankingDataSync.addAccountAndRoutingToAccounts(connection, upserted);
      const accounts = await connection.getBankAccounts();
      expect(accounts.length).to.equal(2);
    });

    it('should still succeed if one upsert fails with a duplicate account error', async () => {
      const fn = BankingDataSync.addAccountAndRouting;
      const connection = await factory.create('bank-connection');
      const stub = sandbox.stub(AccountAndRouting, 'addAccountAndRouting');
      stub.onFirstCall().rejects(new ConflictError('this is a conflict'));
      stub.onSecondCall().callsFake(fn);
      const upserted = await BankingDataSync.upsertBankAccounts(connection);
      await BankingDataSync.addAccountAndRoutingToAccounts(connection, upserted);
      const accounts = await connection.getBankAccounts();
      expect(accounts.length).to.equal(1);
      expect(accounts[0].externalId).to.equal('2');
    });

    it('should throw an error if all accounts are rejected with duplicate', async () => {
      const connection = await factory.create('bank-connection');
      sandbox.stub(BankAccount, 'create').rejects(new ConflictError('this is a conflict'));
      await expect(BankingDataSync.upsertBankAccounts(connection)).to.be.rejectedWith(
        'this is a conflict',
      );
    });

    it('does not skip ids', async () => {
      const connection = await factory.create('bank-connection');
      await BankingDataSync.upsertBankAccounts(connection);
      const minId: number = await BankAccount.max('id');
      for (let i = 0; i < 100; i++) {
        await BankingDataSync.upsertBankAccounts(connection);
      }
      await factory.create('bank-account');
      const minId2: number = await BankAccount.max('id');
      expect(minId + 1).to.eq(minId2);
    });

    it('should return only active accounts if accounts are deleted', async () => {
      const connection = await factory.create('bank-connection');
      const accounts = await BankingDataSync.upsertBankAccounts(connection);
      expect(accounts.length).to.equal(2);
      await accounts[0].destroy();
      const afterDeleted = await BankingDataSync.upsertBankAccounts(connection);
      expect(afterDeleted.length).to.equal(1);
      expect(afterDeleted[0].id).to.equal(accounts[1].id);
    });

    context('copy account routing for old accounts', () => {
      async function generateOldAccountsForMicroDepositTests() {
        const oldBankConnection = await factory.create('bank-connection');
        const { userId, institutionId, id: oldBankConnectionId } = oldBankConnection;

        const oldAccounts: BankAccount[] = await Bluebird.all([
          factory.create('bank-account', {
            userId,
            institutionId,
            lastFour: '1111',
            displayName: 'Account 1',
            accountNumber: 'noMicroDepositRequired',
            accountNumberAes256: 'noMicroDepositRequired123',
            microDeposit: null,
            bankConnectionId: oldBankConnectionId,
          }),
          factory.create('bank-account', {
            userId,
            institutionId,
            lastFour: '2222',
            displayName: 'Account 2',
            accountNumber: 'microDepositComplete',
            accountNumberAes256: 'microDepositComplete123',
            microDeposit: MicroDeposit.COMPLETED,
            bankConnectionId: oldBankConnectionId,
          }),
          factory.create('bank-account', {
            userId,
            institutionId,
            lastFour: '3333',
            displayName: 'Account 3',
            accountNumber: 'microDepositNotRequired',
            accountNumberAes256: 'microDepositNotRequired123',
            microDeposit: MicroDeposit.NOT_REQUIRED,
            bankConnectionId: oldBankConnectionId,
          }),
        ]);

        const newBankConnection: BankConnection = await factory.create('bank-connection', {
          userId,
          institutionId,
        });

        return { oldAccounts, newBankConnection };
      }

      it('should pass for all old accounts with NULL, NOT_REQUIRED, or COMPLETED micro deposits', async () => {
        const { oldAccounts, newBankConnection } = await generateOldAccountsForMicroDepositTests();

        // Create a new account for each old account
        const newAccounts: BankAccount[] = await Bluebird.map(oldAccounts, oldAccount =>
          factory.create('bank-account', {
            lastFour: oldAccount.lastFour,
            displayName: oldAccount.displayName,
            userId: oldAccount.userId,
            institutionId: oldAccount.institutionId,
            bankConnectionId: newBankConnection.id,
          }),
        );

        await BankingDataSync.addAccountAndRoutingToAccounts(newBankConnection, newAccounts);

        // Reload all accounts
        await Bluebird.map(newAccounts, newAccount => newAccount.reload());

        expect(authStub.callCount).to.eq(0);

        // Confirm all got copied over
        for (let i = 0; i < oldAccounts.length; i++) {
          const oldAccount = oldAccounts[i];
          const newAccount = newAccounts[i];
          expect(newAccount.accountNumber).to.eq(oldAccount.accountNumber);
          expect(newAccount.accountNumberAes256).to.eq(oldAccount.accountNumberAes256);
        }
      });

      it('should not copy over old accounts if any old accounts still require micro deposits', async () => {
        const { oldAccounts, newBankConnection } = await generateOldAccountsForMicroDepositTests();

        const { bankConnectionId: oldBankConnectionId, userId, institutionId } = oldAccounts[0];

        oldAccounts.push(
          await factory.create('bank-account', {
            userId,
            institutionId,
            lastFour: '4444',
            displayName: 'Account 4',
            accountNumber: 'microDepositRequired',
            accountNumberAes256: 'microDepositRequired123',
            microDeposit: MicroDeposit.REQUIRED, // <-- This case prevents the copying
            bankConnectionId: oldBankConnectionId,
          }),
        );

        // Create a new account for each old account
        const newAccounts: BankAccount[] = await Bluebird.map(oldAccounts, oldAccount =>
          factory.create('bank-account', {
            lastFour: oldAccount.lastFour,
            displayName: oldAccount.displayName,
            userId: oldAccount.userId,
            institutionId: oldAccount.institutionId,
            bankConnectionId: newBankConnection.id,
          }),
        );

        await BankingDataSync.addAccountAndRoutingToAccounts(newBankConnection, newAccounts);

        // Reload all accounts
        await Bluebird.map(newAccounts, newAccount => newAccount.reload());

        expect(authStub.callCount).to.eq(1);

        // Confirm none got copied over
        for (let i = 0; i < oldAccounts.length; i++) {
          const oldAccount = oldAccounts[i];
          const newAccount = newAccounts[i];
          expect(newAccount.accountNumber).to.not.eq(oldAccount.accountNumber);
          expect(newAccount.accountNumberAes256).to.not.eq(oldAccount.accountNumberAes256);
        }
      });

      it('should not copy over old accounts if any old accounts had failed (canceled) micro deposits', async () => {
        const { oldAccounts, newBankConnection } = await generateOldAccountsForMicroDepositTests();

        const { bankConnectionId: oldBankConnectionId, userId, institutionId } = oldAccounts[0];

        oldAccounts.push(
          await factory.create('bank-account', {
            userId,
            institutionId,
            lastFour: '5555',
            displayName: 'Account 5',
            accountNumber: 'failedMicroDeposit',
            accountNumberAes256: 'failedMicroDeposit123',
            microDeposit: MicroDeposit.FAILED, // <-- This case prevents the copying
            bankConnectionId: oldBankConnectionId,
          }),
        );

        // Create a new account for each old account
        const newAccounts: BankAccount[] = await Bluebird.map(oldAccounts, oldAccount =>
          factory.create('bank-account', {
            lastFour: oldAccount.lastFour,
            displayName: oldAccount.displayName,
            userId: oldAccount.userId,
            institutionId: oldAccount.institutionId,
            bankConnectionId: newBankConnection.id,
          }),
        );

        await BankingDataSync.addAccountAndRoutingToAccounts(newBankConnection, newAccounts);

        // Reload all accounts
        await Bluebird.map(newAccounts, newAccount => newAccount.reload());

        expect(authStub.callCount).to.eq(1);

        // Confirm none got copied over
        for (let i = 0; i < oldAccounts.length; i++) {
          const oldAccount = oldAccounts[i];
          const newAccount = newAccounts[i];
          expect(newAccount.accountNumber).to.not.eq(oldAccount.accountNumber);
          expect(newAccount.accountNumberAes256).to.not.eq(oldAccount.accountNumberAes256);
        }
      });

      it('should fail if there are more new accounts', async () => {
        const oldAccount = await factory.create('bank-account', {
          lastFour: '3344',
          displayName: 'Will Account',
          accountNumber: 'asdfasdfasdfasdf',
          accountNumberAes256: 'asdf1234124asdf',
          microDeposit: null,
        });

        const bankConnection = await factory.create('bank-connection', {
          userId: oldAccount.userId,
          institutionId: oldAccount.institutionId,
        });
        const newAccount = await factory.create('bank-account', {
          lastFour: oldAccount.lastFour,
          displayName: oldAccount.displayName,
          userId: oldAccount.userId,
          institutionId: oldAccount.institutionId,
          bankConnectionId: bankConnection.id,
        });
        const newAccount2 = await factory.create('bank-account', {
          lastFour: '5423',
          userId: oldAccount.userId,
          institutionId: oldAccount.institutionId,
          bankConnectionId: bankConnection.id,
        });
        await newAccount.update({ institutionId: oldAccount.institutionId });

        await BankingDataSync.addAccountAndRoutingToAccounts(bankConnection, [
          newAccount,
          newAccount2,
        ]);

        expect(authStub.callCount).to.eq(1);

        await newAccount.reload();
        expect(newAccount.accountNumber).to.eq(null);
        expect(newAccount.accountNumberAes256).to.eq(null);
      });
    });
  });

  describe('handleExternalIdChanges', () => {
    let connection: BankConnection;
    let account: BankAccount;
    let user: User;
    let getTransactionsStub: sinon.SinonStub;

    beforeEach(async () => {
      account = await factory.create('bank-account', { lastFour: '1111' });
      connection = await account.getBankConnection();
      user = await connection.getUser();
      await user.update({ defaultBankAccountId: account.id });
      getTransactionsStub = sandbox.stub(Plaid, 'getTransactions').resolves({ transactions: [] });
    });

    it('should create an audit log for the update of an external id', async () => {
      const acc = await factory.create('bank-account', {
        displayName: account.displayName,
        lastFour: account.lastFour,
        externalId: 'wowee1',
        userId: connection.userId,
        bankConnectionId: connection.id,
      });
      const accounts: any[] = [acc];

      await handleExternalIdChanges(accounts, connection);

      const al = await AuditLog.findOne({ where: { userId: connection.userId } });
      expect(al.eventUuid).to.equal(connection.id.toString());
      expect(al.extra.nameMatchAccountId).to.deep.equal(accounts[0].id);
      expect(al.extra.matchType).to.deep.equal('name_match');
      expect(al.extra.oldBankAccount.id).to.equal(account.id);
      expect(al.extra.oldBankAccount.externalId).not.to.equal('wowee1');
    });

    it('should match an account by random transactions if available', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          displayName: account.displayName,
          lastFour: null,
          externalId: 'wowee3',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const transaction = await factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: user.id,
        });
        transactions.push(transaction);
      }
      getTransactionsStub.resolves({
        transactions: transactions.map(t =>
          PlaidTransaction({
            name: t.displayName,
            date: t.transactionDate,
            amount: -t.amount,
            account_id: 'wowee3',
          }),
        ),
      });

      await handleExternalIdChanges(accounts, connection);

      const al = await AuditLog.findOne({ where: { userId: connection.userId } });
      expect(al.eventUuid).to.equal(connection.id.toString());
      expect(al.extra.randomTransactionMatchAccountId).to.deep.equal(accounts[0].id);
      expect(al.extra.matchType).to.deep.equal('random_match');
      expect(al.extra.oldBankAccount.id).to.equal(account.id);
      expect(al.extra.oldBankAccount.externalId).not.to.equal('wowee3');
    });

    it('should match an account by random transactions if available', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          displayName: account.displayName,
          lastFour: null,
          externalId: 'bacon',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const transaction = await factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: user.id,
        });
        transactions.push(transaction);
      }
      getTransactionsStub.resolves({
        transactions: transactions.map(t =>
          PlaidTransaction({
            name: t.displayName,
            date: t.transactionDate,
            amount: -t.amount,
            account_id: 'bacon',
          }),
        ),
      });

      await handleExternalIdChanges(accounts, connection);

      const al = await AuditLog.findOne({ where: { userId: connection.userId } });
      expect(al.eventUuid).to.equal(connection.id.toString());
      expect(al.extra.randomTransactionMatchAccountId).to.deep.equal(accounts[0].id);
      expect(al.extra.matchType).to.deep.equal('random_match');
      expect(al.extra.oldBankAccount.id).to.equal(account.id);
      expect(al.extra.oldBankAccount.externalId).not.to.equal('bacon');
    });

    it('should copy data if a match is found', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          displayName: account.displayName,
          lastFour: null,
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const transaction = await factory.create('bank-transaction', {
          bankAccountId: account.id,
          userId: user.id,
        });
        transactions.push(transaction);
      }
      getTransactionsStub.resolves({
        transactions: transactions.map(t =>
          PlaidTransaction({
            name: t.displayName,
            date: t.transactionDate,
            amount: -t.amount,
            account_id: accounts[0].externalId,
          }),
        ),
      });

      await handleExternalIdChanges(accounts, connection);

      await account.reload({ paranoid: false });
      expect(account.deleted).not.to.eq(null);
      await user.reload();
      expect(user.defaultBankAccountId).to.eq(accounts[0].id);
    });

    it('should fail to match if no transactions are found', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          displayName: account.displayName,
          lastFour: null,
          externalId: 'bacon1',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];
      const date = moment().subtract(2, 'days');
      getTransactionsStub.resolves({
        transactions: [
          PlaidTransaction({
            name: 'Dave',
            date: date.format('YYYY-MM-DD'),
            amount: -50,
            account_id: 'bacon1',
          }),
        ],
      });

      await handleExternalIdChanges(accounts, connection);

      const al = await AuditLog.findOne({ where: { userId: connection.userId } });
      expect(al.eventUuid).to.equal(connection.id.toString());
      expect(al.type).to.equal('DEFAULT_ACCOUNT_REMOVED_FROM_PLAID');
    });

    it('should fail to match if a bank transaction is not found', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          displayName: account.displayName,
          lastFour: null,
          externalId: 'bacon2',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];
      const date = moment().subtract(2, 'days');
      await factory.create('payment', {
        bankAccountId: account.id,
        userId: user.id,
        amount: 50,
        created: date,
      });
      getTransactionsStub.resolves({
        transactions: [
          PlaidTransaction({
            name: 'Dave',
            date: date.format('YYYY-MM-DD'),
            amount: -50,
            account_id: 'bacon2',
          }),
        ],
      });

      await handleExternalIdChanges(accounts, connection);

      const al = await AuditLog.findOne({ where: { userId: connection.userId } });
      expect(al.eventUuid).to.equal(connection.id.toString());
      expect(al.type).to.equal('DEFAULT_ACCOUNT_REMOVED_FROM_PLAID');
    });

    it('should delete a non default account that no longer exists', async () => {
      await user.update({ defaultBankAccountId: null });
      const accounts: any[] = [
        await factory.create('bank-account', {
          nickname: 'brand-new-account',
          displayName: 'bacon-and-cheese',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];

      await handleExternalIdChanges(accounts, connection);

      await account.reload({ paranoid: false });
      expect(account.deleted).not.to.equal(null);
    });

    it('should soft delete the users default account', async () => {
      const accounts: any[] = [
        await factory.create('bank-account', {
          nickname: 'brand-new-account',
          displayName: 'bacon-and-cheese',
          userId: connection.userId,
          bankConnectionId: connection.id,
        }),
      ];

      await handleExternalIdChanges(accounts, connection);

      await account.reload({ paranoid: false });
      expect(account.deleted).to.not.equal(undefined);
      expect(deleteSynapsePayNodeStub.callCount).to.eq(1);
    });
  });

  describe('findOneAndHandleSoftDeletes', async () => {
    let bankAccount: BankAccount;
    let user: User;

    beforeEach(async () => {
      bankAccount = await factory.create('checking-account');
      user = await User.findByPk(bankAccount.userId);
    });

    it('should throw a custom error for soft-deleted default accounts', async () => {
      await user.update({ defaultBankAccountId: bankAccount.id });

      await bankAccount.destroy();
      await bankAccount.reload({ paranoid: false });
      await user.reload();

      let result;
      let error;

      try {
        result = await findOneAndHandleSoftDeletes(bankAccount.id, user, {
          bankAccountIdFrom: 'params',
        });
      } catch (ex) {
        error = ex;
        expect(ex.customCode).to.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
      } finally {
        if (result || !error) {
          expect.fail(
            'findOneAndHandleSoftDeletes should recognize that a default account was soft-deleted',
          );
        }
      }
    });

    it('should throw a regular Dave 404 for soft-deleted NON-default accounts', async () => {
      await user.update({ defaultBankAccountId: null });

      await bankAccount.destroy();
      await bankAccount.reload({ paranoid: false });
      await user.reload();

      let result;
      let error;

      try {
        result = await findOneAndHandleSoftDeletes(bankAccount.id, user, {
          bankAccountIdFrom: 'params',
        });
      } catch (ex) {
        error = ex;
        expect(ex.customCode).to.not.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
        expect(ex.statusCode).to.equal(404);
      } finally {
        if (result || !error) {
          expect.fail(
            'findOneAndHandleSoftDeletes should recognize that a non-default account was soft-deleted',
          );
        }
      }
    });

    it('should return the bank account if it is not soft-deleted and belongs to the user', async () => {
      const result = await findOneAndHandleSoftDeletes(bankAccount.id, user, {
        bankAccountIdFrom: 'params',
      });
      expect(result.id).to.equal(bankAccount.id);
    });

    it('optionally allows a different 404 error based on invalid http body input', async () => {
      await user.update({ defaultBankAccountId: null });

      await bankAccount.destroy();
      await bankAccount.reload({ paranoid: false });
      await user.reload();

      let result;
      let error;

      try {
        result = await findOneAndHandleSoftDeletes(bankAccount.id, user, {
          bankAccountIdFrom: 'body',
        });
      } catch (ex) {
        error = ex;
        expect(ex.customCode).to.not.equal(CUSTOM_ERROR_CODES.DEFAULT_ACCOUNT_REMOVED);
        expect(ex.statusCode).to.not.equal(404);
        expect(ex instanceof InvalidParametersError).to.equal(true);
      } finally {
        if (result || !error) {
          expect.fail(
            'findOneAndHandleSoftDeletes should recognize that a non-default account was soft-deleted',
          );
        }
      }
    });
  });
});
