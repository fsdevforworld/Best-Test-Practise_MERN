import {
  handleDisconnect,
  setConnectionStatusAsValid,
  syncUserDefaultBankAccount,
} from '../../../src/domain/banking-data-sync';
import { expect } from 'chai';
import { NotFoundError } from '../../../src/lib/error';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import * as sinon from 'sinon';
import * as plaid from 'plaid';
import { BankAccount, BankConnection, User, AuditLog } from '../../../src/models';
import { BankingDataSourceError } from '../../../src/domain/banking-data-source/error';
import { BankingDataSource, BankAccountSubtype, BankAccountType } from '@dave-inc/wire-typings';
import {
  BankConnectionUpdateType,
  BankingDataSourceErrorType,
  PlaidErrorCode,
} from '../../../src/typings';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import * as Jobs from '../../../src/jobs/data';
import { moment } from '@dave-inc/time-lib';
import { PlaidIntegration } from '../../../src/domain/banking-data-source';
import { getAccountsWithAccountAndRouting } from '../../../src/domain/banking-data-sync/bank-connection';

describe('banking-data-sync/bank-connection', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

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

  beforeEach(() => {
    sandbox.stub(plaid.Client.prototype, 'getAccounts').resolves({ accounts: plaidAccounts });
    sandbox.stub(Jobs, 'createBroadcastBankDisconnectTask');
  });

  afterEach(() => clean(sandbox));

  describe('syncUserDefaultBankAccount', () => {
    it("should throw not found error if provided bank account doesn't exist", async () => {
      let errorThrown;

      try {
        await syncUserDefaultBankAccount(1234567890);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).to.not.be.undefined;
      expect(errorThrown).to.be.instanceOf(NotFoundError);
    });

    it("should update bank connection's primary bank account ID", async () => {
      const bankAccount = await factory.create('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      expect(bankConnection.primaryBankAccountId).to.eq(null);

      await syncUserDefaultBankAccount(bankAccount.id);

      await bankConnection.reload();

      expect(bankConnection.primaryBankAccountId).to.eq(bankAccount.id);
    });
  });

  describe('handleDisconnect', () => {
    let bankConnectionId: number;
    let user: User;

    beforeEach(async () => {
      const bankAccount: BankAccount = await factory.create('checking-account');
      user = await bankAccount.getUser();
      await user.update({ defaultBankAccountId: bankAccount.id });
      bankConnectionId = bankAccount.bankConnectionId;
    });

    context('when Plaid returns a disconnect code', () => {
      const error = new BankingDataSourceError(
        'Error occurred',
        BankingDataSource.Plaid,
        PlaidErrorCode.ItemLoginRequired,
        BankingDataSourceErrorType.Disconnected,
        {},
      );
      it('sets hasValidCredentials to false', async () => {
        const connection = await BankConnection.findByPk(bankConnectionId);

        await handleDisconnect(connection, error);

        const updatedConnection = await BankConnection.findByPk(bankConnectionId);

        expect(updatedConnection.hasValidCredentials).to.equal(false);
      });

      it('adds a BANK_CONNECTION_DISCONNECTED entry into the bank connection update log', async () => {
        const connection = await BankConnection.findByPk(bankConnectionId);

        const spy = sandbox.spy(BankConnectionUpdate, 'create');

        await handleDisconnect(connection, error);

        expect(spy.callCount).to.eq(1);
        expect(spy.firstCall.args[0].type).to.eq('BANK_CONNECTION_DISCONNECTED');
      });
    });

    describe('setConnectionStatusAsValid', () => {
      it('clears the plaid error from the bank connection', async () => {
        const bankConnection = await factory.create('bank-connection', {
          bankingDataSourceErrorCode: PlaidErrorCode.ItemLoginRequired,
          bankingDataSourceErrorAt: moment().subtract(1, 'day'),
        });

        await setConnectionStatusAsValid(bankConnection, { type: 'maple' });

        await bankConnection.reload();

        expect(bankConnection.bankingDataSourceErrorCode).to.equal(null);
        expect(bankConnection.bankingDataSourceErrorAt).to.equal(null);
      });

      it('creates a bank connection update entry if the connection had invalid credentials', async () => {
        const bankConnection = await factory.create('bank-connection', {
          hasValidCredentials: false,
        });
        const spy = sandbox.spy(BankConnectionUpdate, 'create');

        await setConnectionStatusAsValid(bankConnection, {
          type: 'hickory-smoked',
        });

        expect(spy.callCount).to.eq(1);
        expect(spy.firstCall.args[0].type).to.eq(BankConnectionUpdateType.RECONNECTED);
        expect(spy.firstCall.args[0].bankConnectionId).to.eq(bankConnection.id);
      });

      it('does not create a bank connection update entry if the credentials were already valid', async () => {
        const bankConnection = await factory.create('bank-connection', {
          hasValidCredentials: true,
        });
        const spy = sandbox.spy(BankConnectionUpdate, 'create');

        await setConnectionStatusAsValid(bankConnection, {
          type: 'brown-sugar',
        });

        expect(spy.callCount).to.eq(0);
      });

      it('sets the extra field on the bank connection update', async () => {
        const bankConnection = await factory.create('bank-connection', {
          hasValidCredentials: false,
        });
        const spy = sandbox.spy(BankConnectionUpdate, 'create');

        await setConnectionStatusAsValid(bankConnection, { type: 'bar' });

        expect(spy.callCount).to.eq(1);
        expect(spy.firstCall.args[0].type).to.eq(BankConnectionUpdateType.RECONNECTED);
        expect(spy.firstCall.args[0].extra.type).to.eq('bar');
        expect(spy.firstCall.args[0].bankConnectionId).to.eq(bankConnection.id);
      });
    });

    describe('getAccountsWithAccountAndRouting', () => {
      it('creates an audit log on success', async () => {
        const bankConnection = await factory.create('bank-connection');
        const plaidStub = sandbox.stub(
          PlaidIntegration.prototype,
          'getAccountsWithAccountAndRouting',
        );
        const accountResponse = [
          {
            bankingDataSource: BankingDataSource.Plaid,
            externalId: '123',
            subtype: BankAccountSubtype.Checking,
            type: BankAccountType.Depository,
            account: '1234',
            routing: '12345',
          },
        ];

        plaidStub.resolves(accountResponse);

        await getAccountsWithAccountAndRouting(bankConnection);

        const auditLog = await AuditLog.findOne({
          where: {
            userId: bankConnection.userId,
            type: 'BANK_CONNECTION_GET_AUTH_SUCCESS',
          },
        });

        expect(auditLog).to.exist;
        expect(auditLog.extra).to.eql({
          bankConnectionId: bankConnection.id,
          source: bankConnection.bankingDataSource,
          institutionId: bankConnection.institutionId,
          accounts: [{ externalId: '123', account: true, routing: true }],
        });
      });

      it('creates an audit log with missing acc/routing info', async () => {
        const bankConnection = await factory.create('bank-connection');
        const plaidStub = sandbox.stub(
          PlaidIntegration.prototype,
          'getAccountsWithAccountAndRouting',
        );
        const accountResponse = [
          {
            bankingDataSource: BankingDataSource.Plaid,
            externalId: '123',
            subtype: BankAccountSubtype.Checking,
            type: BankAccountType.Depository,
          },
        ];

        plaidStub.resolves(accountResponse);

        await getAccountsWithAccountAndRouting(bankConnection);

        const auditLog = await AuditLog.findOne({
          where: {
            userId: bankConnection.userId,
            type: 'BANK_CONNECTION_GET_AUTH_SUCCESS',
          },
        });

        expect(auditLog).to.exist;
        expect(auditLog.extra).to.eql({
          bankConnectionId: bankConnection.id,
          source: bankConnection.bankingDataSource,
          institutionId: bankConnection.institutionId,
          accounts: [{ externalId: '123', account: false, routing: false }],
        });
      });
    });
  });
});
