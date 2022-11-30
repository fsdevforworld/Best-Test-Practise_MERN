import { moment } from '@dave-inc/time-lib';
import * as verificationTask from '../../src/crons/ach-micro-deposit-verification';
import { sequelize } from '../../src/models';
import * as sinon from 'sinon';
import { BankAccount } from '../../src/models';
import * as Notification from '../../src/domain/notifications';
import SynpasePayNodeLib from '../../src/domain/synapsepay/node';
import { expect } from 'chai';
import { clean, up } from '../test-helpers';
import factory from '../factories';
import * as Bluebird from 'bluebird';
import { MicroDepositType } from '../../src/models/bank-account';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';
import { insertFixtureBankTransactions } from '../test-helpers/bank-transaction-fixtures';

describe('ACH micro-deposit verification task', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(function() {
    this.stubNotFound = sandbox.stub(Notification, 'sendACHMicroDepositNotFound').resolves();
    this.stubVerified = sandbox.stub(Notification, 'sendACHMicroDepositVerified').resolves();
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return up();
  });

  afterEach(() => clean(sandbox));

  it('should get one bank account for micro-deposit verification', async () => {
    const bankAccounts = await verificationTask.getBankAccountsForMicroDepositValidation();
    expect(bankAccounts.length).to.equal(1);
  });

  it('should not find any bank account for micro-deposit verification', async () => {
    const bankAccountId = 1201;
    await BankAccount.update({ microDeposit: 'COMPLETED' }, { where: { id: bankAccountId } });
    let bankAccounts = await verificationTask.getBankAccountsForMicroDepositValidation();
    expect(bankAccounts.length).to.equal(0);

    await BankAccount.update({ microDeposit: 'FAILED' }, { where: { id: bankAccountId } });
    bankAccounts = await verificationTask.getBankAccountsForMicroDepositValidation();
    expect(bankAccounts.length).to.equal(0);

    await BankAccount.update({ microDeposit: 'NOT_REQUIRED' }, { where: { id: bankAccountId } });
    bankAccounts = await verificationTask.getBankAccountsForMicroDepositValidation();
    expect(bankAccounts.length).to.equal(0);
  });

  it('no action taken if the micro-deposit happened today', async function() {
    // Changed the micro-deposit created date to today and this shouldn't trigger anything
    const bankAccountId = 1201;
    await BankAccount.update(
      { microDepositCreated: moment().format('YYYY-MM-DD HH:mm:ss') },
      { where: { id: bankAccountId } },
    );
    await verificationTask.main();
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.notCalled(this.stubNotFound);
  });

  it('fail and send if the micro-deposit happened 11 days ago', async function() {
    const bankAccountId = 1201;
    const back = verificationTask.NO_SMS_THRESHOLD_DAYS + 1;
    await BankAccount.update(
      {
        microDepositCreated: moment()
          .subtract(back, 'days')
          .format('YYYY-MM-DD HH:mm:ss'),
      },
      { where: { id: bankAccountId } },
    );
    await verificationTask.main();
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.called(this.stubNotFound);
    const account = await BankAccount.findByPk(bankAccountId);
    expect(account.microDeposit).to.eq(MicroDepositType.Failed);
  });

  it('should detect micro-deposits and validate it', async function() {
    sandbox.stub(SynpasePayNodeLib, 'verifyMicroDeposit').resolves(true);

    await verificationTask.main();

    const bankAccountId = 1201;
    const bankAccount = await BankAccount.findByPk(bankAccountId);
    expect(bankAccount.microDeposit).to.equal('COMPLETED');
    sinon.assert.calledOnce(this.stubVerified);
    sinon.assert.notCalled(this.stubNotFound);
  });

  it('should detect micro-deposits and validation should fail', async function() {
    sandbox.stub(SynpasePayNodeLib, 'verifyMicroDeposit').resolves(false);

    await verificationTask.main();

    const bankAccountId = 1201;
    const bankAccount = await BankAccount.findByPk(bankAccountId);
    expect(bankAccount.microDeposit).to.equal('FAILED');
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.calledOnce(this.stubNotFound);
  });

  it('should not detect micro-deposits after name change in the test case', async function() {
    const query = 'UPDATE bank_transaction SET display_name = ?, external_name = ? WHERE id = ?';
    await sequelize.query(query, { replacements: ['Pizza Hut', 'Pizza Hut', 1250] });

    await verificationTask.main();

    const bankAccountId = 1201;
    const bankAccount = await BankAccount.findByPk(bankAccountId);
    expect(bankAccount.microDeposit).to.equal('REQUIRED');
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.notCalled(this.stubNotFound);
  });

  it('should unable to verify exception', async function() {
    sandbox.stub(SynpasePayNodeLib, 'verifyMicroDeposit').rejects({
      response: {
        body: {
          error: {
            en: 'Unable to verify node since node permissions are CREDIT-AND-DEBIT.',
          },
        },
      },
    });
    const bankAccount = await factory.create('bank-account', {
      microDeposit: 'REQUIRED',
      microDepositCreated: moment().subtract(2, 'days'),
    });
    await Bluebird.each(
      [0, 0],
      async () =>
        await factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: moment().subtract(2, 'days'),
          displayName: 'DaveBaconCheese',
          amount: 0.02,
        }),
    );

    await verificationTask.main();

    expect(bankAccount.microDeposit).to.equal('REQUIRED');
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.notCalled(this.stubNotFound);
    await bankAccount.reload();
    expect(bankAccount.microDeposit).to.eq(MicroDepositType.Completed);
  });

  it('should handle node locked exception', async function() {
    sandbox.stub(SynpasePayNodeLib, 'verifyMicroDeposit').rejects({
      response: {
        body: {
          error: {
            en: 'Unable to verify node since node permissions are LOCKED.',
          },
        },
      },
    });
    const bankAccount = await factory.create('bank-account', {
      microDeposit: 'REQUIRED',
      microDepositCreated: moment().subtract(2, 'days'),
    });
    await Bluebird.each(
      [0, 0],
      async () =>
        await factory.create('bank-transaction', {
          userId: bankAccount.userId,
          bankAccountId: bankAccount.id,
          transactionDate: moment().subtract(2, 'days'),
          displayName: 'DaveBaconCheese',
          externalName: 'DaveBaconCheese',
          amount: 0.02,
        }),
    );

    await verificationTask.main();

    expect(bankAccount.microDeposit).to.equal('REQUIRED');
    sinon.assert.notCalled(this.stubVerified);
    sinon.assert.notCalled(this.stubNotFound);
    await bankAccount.reload();
    expect(bankAccount.microDeposit).to.eq(MicroDepositType.Failed);
  });
});
