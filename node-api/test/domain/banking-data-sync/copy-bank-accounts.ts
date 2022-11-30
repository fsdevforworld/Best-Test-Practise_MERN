import { BankAccount } from '../../../src/models';
import BankConnection from '../../../src/models/bank-connection';
import * as sinon from 'sinon';
import factory from '../../factories';
import { copyBankAccountData } from '../../../src/domain/banking-data-sync/copy-bank-account';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { clean, loadFixtures } from '../../test-helpers';
import * as RecurringTransactionJobs from '../../../src/domain/recurring-transaction/jobs';
import * as BankingDataSource from '../../../src/domain/banking-data-source';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import { paymentMethodUpdateEvent } from '../../../src/domain/event';

describe('banking-data-sync/copy-bank-account', () => {
  const sandbox = sinon.createSandbox();
  let paymentMethodUpdateEventStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(async () => {
    await loadFixtures();
    stubBankTransactionClient(sandbox);
    sandbox.stub(RecurringTransactionJobs, 'createUpdateExpectedTransactionsTask');
    paymentMethodUpdateEventStub = sandbox.stub(paymentMethodUpdateEvent, 'publish').resolves();
  });
  afterEach(() => clean(sandbox));
  describe('copyBankAccountData', () => {
    let oldBankAccount: BankAccount;
    let newBankAccount: BankAccount;
    let connection: BankConnection;
    let getTransactionStub: sinon.SinonStub;

    beforeEach(async () => {
      oldBankAccount = await factory.create('bank-account');
      newBankAccount = await factory.create('bank-account', {
        userId: oldBankAccount.userId,
        bankConnectionId: oldBankAccount.bankConnectionId,
      });
      connection = await oldBankAccount.getBankConnection();
      getTransactionStub = sandbox.stub().resolves([]);
      sandbox
        .stub(BankingDataSource, 'generateBankingDataSource')
        .withArgs(connection)
        .returns({
          getTransactions: getTransactionStub,
        });
    });

    it('should copy payment methods over', async () => {
      const pm = await factory.create('payment-method', {
        bankAccountId: oldBankAccount.id,
        userId: oldBankAccount.userId,
      });
      await oldBankAccount.update({ defaultPaymentMethodId: pm.id });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);

      expect(newBankAccount.defaultPaymentMethodId).to.eq(pm.id);
      await pm.reload();
      expect(pm.bankAccountId).to.eq(newBankAccount.id);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should copy recurring transactions over', async () => {
      const rt = await factory.create('recurring-transaction', {
        bankAccountId: oldBankAccount.id,
        userId: oldBankAccount.userId,
      });
      await oldBankAccount.update({ mainPaycheckRecurringTransactionId: rt.id });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);

      expect(newBankAccount.mainPaycheckRecurringTransactionId).to.eq(rt.id);
      await rt.reload();
      expect(rt.bankAccountId).to.eq(newBankAccount.id);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should delete the old bank account and nullify fields', async () => {
      const rt = await factory.create('recurring-transaction', {
        bankAccountId: oldBankAccount.id,
        userId: oldBankAccount.userId,
      });
      await oldBankAccount.update({
        mainPaycheckRecurringTransactionId: rt.id,
        synapseNodeId: '1234',
        risepayId: 'asdf',
      });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);

      await oldBankAccount.reload({ paranoid: false });
      expect(oldBankAccount.mainPaycheckRecurringTransactionId).to.eq(null);
      expect(oldBankAccount.synapseNodeId).to.eq(null);
      expect(oldBankAccount.risepayId).to.eq(null);
      expect(oldBankAccount.deleted).not.to.eq(null);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should copy over account and routing', async () => {
      await oldBankAccount.update({
        accountNumber: '1234',
        accountNumberAes256: 'asdf',
      });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);

      expect(newBankAccount.accountNumber).to.eq('1234');
      expect(newBankAccount.accountNumberAes256).to.eq('asdf');

      await oldBankAccount.reload({ paranoid: false });
      expect(oldBankAccount.accountNumber).to.eq(null);
      expect(oldBankAccount.accountNumberAes256).to.eq(null);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should pull old transactions for the account', async () => {
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);
      expect(getTransactionStub.callCount).to.eq(1);
      expect(moment(getTransactionStub.firstCall.args[0]).toDate()).to.be.lessThan(
        moment()
          .subtract(5, 'months')
          .toDate(),
      );
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should update the user default bank account', async () => {
      const user = await oldBankAccount.getUser();
      await user.update({ defaultBankAccountId: oldBankAccount.id });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);
      await user.reload();
      expect(user.defaultBankAccountId).to.eq(newBankAccount.id);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should not update the user default bank account if account is not the default', async () => {
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);
      const user = await oldBankAccount.getUser();
      expect(user.defaultBankAccountId).to.not.eq(newBankAccount.id);
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should copy over old transactions', async () => {
      getTransactionStub.resolves([
        {
          amount: 1361.67,
          displayName: 'programming Unbranded Bedfordshire',
          externalId: 'c9057ac5-ccaa-4d74-a5e0-c86baa9b3973',
          pending: false,
          transactionDate: moment('2019-01-02'),
          externalName: 'programming Unbranded Bedfordshire',
          bankAccountExternalId: newBankAccount.externalId,
        },
      ]);
      await factory.create('bank-transaction', {
        userId: oldBankAccount.userId,
        bankAccountId: oldBankAccount.id,
        transactionDate: '2019-01-02',
        created: moment().subtract(20, 'days'),
        updated: moment().subtract(20, 'days'),
      });
      const transactionToCopy = await factory.create('bank-transaction', {
        userId: oldBankAccount.userId,
        bankAccountId: oldBankAccount.id,
        transactionDate: '2018-10-02',
        externalId: 'bacon',
      });
      await copyBankAccountData(oldBankAccount, newBankAccount, connection);
      const transactions = await newBankAccount.getBankTransactions();
      expect(transactions.length).to.eq(2);

      expect(transactions[1].externalId).to.eq(
        `${transactionToCopy.externalId}-copy-${newBankAccount.id}`,
      );
      expect(moment(transactions[1].created).unix()).to.gt(
        moment()
          .subtract(1, 'minute')
          .unix(),
      );
      expect(moment(transactions[1].updated).unix()).to.gt(
        moment()
          .subtract(1, 'minute')
          .unix(),
      );
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });
  });
});
