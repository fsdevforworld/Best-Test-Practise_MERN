import plaidClient from '../../../src/lib/plaid';
import { deleteBankConnection } from '../../../src/services/loomis-api/domain/delete-bank-account';
import { BankAccount, BankConnection, User } from '../../../src/models';
import { expect } from 'chai';
import factory from '../../factories';
import * as RewardsHelper from '../../../src/domain/rewards';
import { InvalidParametersError } from '../../../src/lib/error';
import { clean } from '../../test-helpers';
import * as sinon from 'sinon';
import * as plaid from 'plaid';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';

describe('banking-data-sync/delete-bank-account', () => {
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
    sandbox.stub(SynapsepayNodeLib, 'deleteSynapsePayNode').resolves();
  });

  afterEach(() => clean(sandbox));
  describe('deleteBankConnection', () => {
    let deletePlaidItemStub: any;

    beforeEach(() => {
      deletePlaidItemStub = sandbox.stub(plaidClient, 'removeItem').resolves();
    });

    it('returns immediately when the bank connection does not exist', async () => {
      const connection = await deleteBankConnection(await BankConnection.findByPk(428982734987));
      expect(connection).to.eq(null);
    });

    it('should delete the associated banking data source', async () => {
      const bankConnection = await factory.create<BankConnection>('bank-connection');
      const authToken = bankConnection.authToken;

      await deleteBankConnection(bankConnection);

      const deletedBankConnection = await BankConnection.findByPk(bankConnection.id, {
        paranoid: false,
      });

      sinon.assert.calledOnce(deletePlaidItemStub);
      sinon.assert.calledWith(deletePlaidItemStub, authToken);
      expect(deletedBankConnection).to.not.eq(null);
      expect(deletedBankConnection.deleted).to.exist;
      expect(deletedBankConnection.authToken).to.eq(`deleted-${bankConnection.id}-${authToken}`);
    });

    it('should not delete the associated banking data source if flag is false', async () => {
      const bankConnection = await factory.create<BankConnection>('bank-connection');

      await deleteBankConnection(bankConnection, {
        deleteBankingDataSource: false,
      });

      const deletedBankConnection = await BankConnection.findByPk(bankConnection.id, {
        paranoid: false,
      });

      sinon.assert.notCalled(deletePlaidItemStub);
      expect(deletedBankConnection).to.not.eq(null);
      expect(deletedBankConnection.deleted).to.exist;
    });

    context('when the user does NOT have any subscription payments or advances', () => {
      it('does a hard delete of all data with force = true ', async () => {
        const connection = await factory.create('bank-connection');
        await deleteBankConnection(connection, { force: true });
        const deleted = await BankConnection.findByPk(connection.id, { paranoid: false });
        expect(deleted).to.eq(null);
      });

      it('does a soft delete of all data with force = false ', async () => {
        const connection = await factory.create('bank-connection');
        await deleteBankConnection(connection);
        const deleted = await BankConnection.findByPk(connection.id, { paranoid: false });
        expect(deleted).to.not.eq(null);
      });

      context('when payment method linked to empyr', () => {
        it('unlinks the empyr card if one exists', async () => {
          const account = await factory.create('bank-account');
          const connection = await account.getBankConnection();
          const paymentMethod = await factory.create('payment-method', {
            userId: connection.userId,
            bankAccountId: account.id,
            empyrCardId: 1234,
          });

          const expectedPaymentMethodId = paymentMethod.id;
          const deleteCardStub = sandbox.stub(RewardsHelper, 'deleteEmpyrCard');
          const expectedUser = await User.findByPk(connection.userId);

          await deleteBankConnection(connection);

          expect(deleteCardStub.args[0][0].id).to.equal(expectedUser.id);
          expect(deleteCardStub.args[0][1]).to.equal(expectedPaymentMethodId);
        });
      });

      it('throws error when there is an outstanding advance', async () => {
        const user = await factory.create('user');
        const bankAccount = await factory.create<BankAccount>('bank-account', { userId: user.id });
        const bankConnection = await bankAccount.getBankConnection();

        await factory.create('advance', {
          userId: user.id,
          outstanding: 12,
          bankAccountId: bankAccount.id,
        });

        let errorThrown: Error;

        try {
          await deleteBankConnection(bankConnection);
        } catch (err) {
          errorThrown = err;
        }

        expect(errorThrown).to.not.be.undefined;
        expect(errorThrown).to.be.instanceOf(InvalidParametersError);
        expect(errorThrown.message).to.equal(
          'Cannot delete a bank connection with outstanding advances.',
        );
      });
    });
  });
});
