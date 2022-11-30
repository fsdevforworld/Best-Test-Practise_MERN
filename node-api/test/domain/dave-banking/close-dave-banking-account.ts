import * as DeleteBankConnection from '../../../src/services/loomis-api/domain/delete-bank-account';
import { expect } from 'chai';
import { isEmpty } from 'lodash';
import * as sinon from 'sinon';
import {
  closeDaveBankingAccount,
  CloseDaveBankingAccountError,
  CloseDaveBankingAccountErrorReason,
} from '../../../src/domain/dave-banking/close-dave-banking-account';
import { BankAccount, BankConnection, BankConnectionTransition, User } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import * as RedisLock from '../../../src/lib/redis-lock';

describe('closeDaveBankingAccount', () => {
  const sandbox = sinon.createSandbox();

  let user: User;
  let daveBankConnection: BankConnection;
  let daveSpendingAccount: BankAccount;

  before(() => clean(sandbox));

  beforeEach(async () => {
    user = await factory.create('subscribed-user');
    daveBankConnection = await factory.create('bank-of-dave-bank-connection', {
      userId: user.id,
    });

    daveSpendingAccount = await factory.create('checking-account', {
      userId: user.id,
      bankConnectionId: daveBankConnection.id,
      synapseNodeId: null,
    });

    // ensure connection doesn't require validation
    await factory.create('advance', { bankAccountId: daveSpendingAccount.id });

    await daveBankConnection.update({ primaryBankAccountId: daveSpendingAccount.id });
    await user.update({ defaultBankAccountId: daveSpendingAccount.id });
  });

  afterEach(() => clean(sandbox));

  describe('with only a spending account', () => {
    it('should destroy the account and bank connection', async () => {
      const lockSpy = sandbox.spy(RedisLock, 'lockAndRun');
      await closeDaveBankingAccount({
        daveBankingAccountId: daveSpendingAccount.externalId,
        daveUserId: user.id,
      });

      expect(await BankAccount.findByPk(daveSpendingAccount.id)).to.be.null;
      expect(await BankConnection.findByPk(daveBankConnection.id)).to.be.null;

      sinon.assert.calledWith(
        lockSpy,
        `dave-banking-close-account-lock-${user.id}`,
        sinon.match.func,
      );
    });

    it('should delete all bank connection transition records', async () => {
      const bankConnectionTransition = await factory.create('bank-connection-transition', {
        toBankConnectionId: daveBankConnection.id,
      });

      await closeDaveBankingAccount({
        daveBankingAccountId: daveSpendingAccount.externalId,
        daveUserId: user.id,
      });

      const deletedBankConnectionTransitions = await BankConnectionTransition.findAll({
        where: { toBankConnectionId: bankConnectionTransition.id },
      });

      expect(isEmpty(deletedBankConnectionTransitions)).to.equal(true);
    });

    it('should switch default account to plaid connected account', async () => {
      const plaidBankConnection: BankConnection = await factory.create('plaid-bank-connection', {
        userId: user.id,
      });
      const plaidBankAccount: BankAccount = await factory.create('checking-account', {
        userId: user.id,
        bankConnectionId: plaidBankConnection.id,
      });

      await plaidBankConnection.update({ primaryBankAccountId: plaidBankAccount.id });

      await closeDaveBankingAccount({
        daveBankingAccountId: daveSpendingAccount.externalId,
        daveUserId: user.id,
      });

      const { defaultBankAccountId } = await User.findOne({
        where: {
          id: user.id,
        },
        paranoid: false,
      });

      expect(defaultBankAccountId).to.equal(plaidBankAccount.id);
    });
  });

  describe('with multiple accounts', () => {
    let otherAccount: BankAccount;
    beforeEach(async () => {
      otherAccount = await factory.create('savings-account', {
        userId: user.id,
        bankConnectionId: daveBankConnection.id,
        externalId: 'dave-goals-account',
        synapseNodeId: null,
      });
    });

    it('should not delete the bank connection if other accounts exist', async () => {
      await closeDaveBankingAccount({
        daveBankingAccountId: otherAccount.externalId,
        daveUserId: user.id,
      });

      expect(await BankAccount.findByPk(otherAccount.id)).to.be.null;
      expect(await BankAccount.findByPk(daveSpendingAccount.id)).to.be.ok;
      expect(await BankConnection.findByPk(daveBankConnection.id)).to.be.ok;

      // since we didn't delete the spending account, we shouldn't be messing with the user's default account
      const { defaultBankAccountId } = await User.findOne({
        where: {
          id: user.id,
        },
        paranoid: false,
      });

      expect(defaultBankAccountId).to.equal(daveSpendingAccount.id);
    });

    it('should still transition to another bank connection if spending is deleted', async () => {
      const plaidBankConnection: BankConnection = await factory.create('plaid-bank-connection', {
        userId: user.id,
      });
      const plaidBankAccount: BankAccount = await factory.create('checking-account', {
        userId: user.id,
        bankConnectionId: plaidBankConnection.id,
      });

      await plaidBankConnection.update({ primaryBankAccountId: plaidBankAccount.id });

      await closeDaveBankingAccount({
        daveBankingAccountId: daveSpendingAccount.externalId,
        daveUserId: user.id,
      });

      const { defaultBankAccountId } = await User.findOne({
        where: {
          id: user.id,
        },
        paranoid: false,
      });

      expect(defaultBankAccountId).to.equal(plaidBankAccount.id);
      expect(await BankConnection.findByPk(daveBankConnection.id)).to.be.ok;
    });
  });

  describe('errors', () => {
    it('should throw CloseDaveBankingAccountError if dave banking connection failed deletion', async () => {
      sandbox.stub(DeleteBankConnection, 'deleteBankConnection').throws(new Error('pelican'));

      let error;
      try {
        await closeDaveBankingAccount({
          daveBankingAccountId: daveSpendingAccount.externalId,
          daveUserId: user.id,
        });
      } catch (exception) {
        error = exception;
      }

      expect(error).to.be.instanceOf(CloseDaveBankingAccountError);
      expect(error.reason).to.equal(
        CloseDaveBankingAccountErrorReason.BANK_CONNECTION_DELETE_FAILED,
      );
    });

    it('should throw CloseDaveBankingAccountError if dave banking connection not found', async () => {
      const plaidBankAccount: BankAccount = await factory.create('checking-account', {
        userId: user.id,
      });

      let error;
      try {
        await closeDaveBankingAccount({
          daveBankingAccountId: plaidBankAccount.externalId,
          daveUserId: user.id,
        });
      } catch (exception) {
        error = exception;
      }

      expect(error).to.be.instanceOf(CloseDaveBankingAccountError);
      expect(error.reason).to.equal(CloseDaveBankingAccountErrorReason.BANK_CONNECTION_NOT_FOUND);
    });

    it('should throw CloseDaveBankingAccountError if bank account not found', async () => {
      let error;
      try {
        await closeDaveBankingAccount({ daveBankingAccountId: 'foo-bar', daveUserId: user.id });
      } catch (exception) {
        error = exception;
      }

      expect(error).to.be.instanceOf(CloseDaveBankingAccountError);
      expect(error.reason).to.equal(CloseDaveBankingAccountErrorReason.BANK_ACCOUNT_NOT_FOUND);
    });

    it('should throw CloseDaveBankingAccountError if lock exceeded', async () => {
      sandbox.stub(RedisLock, 'lockAndRun').resolves({ completed: false });

      let error;
      try {
        await closeDaveBankingAccount({
          daveBankingAccountId: daveSpendingAccount.externalId,
          daveUserId: user.id,
        });
      } catch (exception) {
        error = exception;
      }

      expect(error).to.be.instanceOf(CloseDaveBankingAccountError);
      expect(error.reason).to.equal(CloseDaveBankingAccountErrorReason.LOCK_EXCEEDED);

      expect(await BankAccount.findByPk(daveSpendingAccount.id)).to.be.ok;
      expect(await BankConnection.findByPk(daveBankConnection.id)).to.be.ok;
    });
  });
});
