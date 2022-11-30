import * as sinon from 'sinon';
import { BankAccount, BankConnection, User } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { expect } from 'chai';
import * as plaid from 'plaid';
import { InvalidParametersError } from '../../../src/lib/error';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import { BankConnectionUpdate } from '../../../src/models/warehouse';
import SynapsepayNode from '../../../src/domain/synapsepay/node';

const sandbox = sinon.createSandbox();

describe('banking-data-sync/create-bank-accounts', () => {
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
    sandbox.stub(plaid.Client.prototype, 'getAuth').resolves({
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

    sandbox.stub(SynapsepayNode, 'deleteSynapsePayNode').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('createBankAccounts', () => {
    it('should throw an error if existing plaid connection has outstanding advances', async () => {
      const user = await factory.create<User>('user');

      const [newPlaidConnectionA, existingPlaidConnectionB] = await Promise.all([
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
      ]);

      const existingBankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: existingPlaidConnectionB.id,
      });

      await factory.create('advance', {
        bankAccountId: existingBankAccount.id,
        outstanding: 75,
      });

      let errorThrown: Error;

      try {
        await BankingDataSync.createBankAccounts(newPlaidConnectionA, user);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).to.not.be.undefined;
      expect(errorThrown).to.be.instanceOf(InvalidParametersError);
      expect(errorThrown.message).to.equal(
        'Cannot delete a bank connection with outstanding advances.',
      );
    });

    it('should throw an error if existing plaid connection has pending payments', async () => {
      const user = await factory.create<User>('user');

      const [newPlaidConnectionA, existingPlaidConnectionB] = await Promise.all([
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
      ]);

      const existingBankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: existingPlaidConnectionB.id,
      });

      await factory.create('payment', {
        status: ExternalTransactionStatus.Pending,
        bankAccountId: existingBankAccount.id,
      });

      let errorThrown: Error;

      try {
        await BankingDataSync.createBankAccounts(newPlaidConnectionA, user);
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).to.not.be.undefined;
      expect(errorThrown).to.be.instanceOf(InvalidParametersError);
      expect(errorThrown.message).to.equal('Cannot delete a bank connection with pending payments');
    });

    it('should create new bank accounts, while deleting existing plaid bank connections', async () => {
      const user = await factory.create<User>('user');

      const [newPlaidConnectionA, existingPlaidConnectionB, bodConnection] = await Promise.all([
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
        factory.create<BankConnection>('bank-connection', { userId: user.id }),
        factory.create<BankConnection>('bank-of-dave-bank-connection', { userId: user.id }),
      ]);

      const [existingBankAccount] = await Promise.all([
        factory.create('bank-account', {
          userId: user.id,
          bankConnectionId: existingPlaidConnectionB.id,
        }),
        factory.create('bank-account', {
          userId: user.id,
          bankConnectionId: bodConnection.id,
        }),
      ]);

      await Promise.all([
        factory.create('advance', {
          bankAccountId: existingBankAccount.id,
          outstanding: 0,
        }),
        factory.create('payment', {
          status: ExternalTransactionStatus.Completed,
          bankAccountId: existingBankAccount.id,
        }),
      ]);

      await BankingDataSync.createBankAccounts(newPlaidConnectionA, user);

      await Promise.all([
        newPlaidConnectionA.reload({ paranoid: false }),
        existingPlaidConnectionB.reload({ paranoid: false }),
        bodConnection.reload({ paranoid: false }),
      ]);

      expect(existingPlaidConnectionB.deleted).to.not.be.null;

      expect(newPlaidConnectionA.deleted).to.be.null;
      expect(bodConnection.deleted).to.be.null;
    });

    it('should create BankConnectionUpdate pub event', async () => {
      const createStub = sandbox.stub(BankConnectionUpdate, 'create');
      const user = await factory.create<User>('user');
      const connection = await factory.create<BankConnection>('bank-connection', {
        userId: user.id,
      });

      const accounts = await BankingDataSync.createBankAccounts(connection, user);

      const eventData = {
        userId: connection.userId,
        bankConnectionId: connection.id,
        type: 'BANK_CONNECTION_ACCOUNTS_ADDED',
        extra: {
          bankingDataSource: connection.bankingDataSource,
          accounts: 2,
          authAccounts: accounts.map(({ id, accountNumber }) => ({
            id,
            accountNumber: !!accountNumber,
          })),
        },
      };
      sinon.assert.calledOnce(createStub);
      sinon.assert.calledWith(createStub, eventData);
    });
  });
});
