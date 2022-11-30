import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import BankAccountHelper from '../../src/helper/bank-account';
import gcloudKms from '../../src/lib/gcloud-kms';
import { BankAccount } from '../../src/models';
import { clean, stubBankTransactionClient, up } from '../test-helpers';
import { insertFixtureBankTransactions } from '../test-helpers/bank-transaction-fixtures';
import BankingDataClient from '../../src/lib/heath-client';
import { upsertBankTransactionForStubs } from '../test-helpers/stub-bank-transaction-client';

describe('BankAccount', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    await up();
  });
  afterEach(() => clean(sandbox));

  describe('Find ACH Micro-Deposit transactions', () => {
    it('should successfully find 2 ACH micro-deposit transaction', async () => {
      const bankAccountId = 1201;
      const bankAccount = await BankAccount.findByPk(bankAccountId);
      const result = await bankAccount.findACHMicroDeposit();
      expect(result.length).to.equal(1);
      expect(result[0].length).to.equal(2);
      result[0].sort((a: number, b: number) => a - b);
      expect(result[0]).to.deep.equal([0.03, 0.06]);
    });

    it('fail to find 2 ACH micro-deposit transaction', async () => {
      const transaction = await BankingDataClient.getSingleBankTransaction(1201, {
        id: 1250,
      });
      transaction.displayName = 'Pizza Hut';
      transaction.externalName = 'Pizza Hut';
      upsertBankTransactionForStubs(transaction);
      const bankAccountId = 1201;
      const bankAccount = await BankAccount.findByPk(bankAccountId);
      const result = await bankAccount.findACHMicroDeposit();
      expect(result.length).to.equal(0);
    });
  });

  describe('findMatchingDeletedAccounts', () => {
    it('should succeed finding a matching deleted bank with micro completed', async () => {
      const bankAccount = await BankAccount.findByPk(1202);
      const res = await BankAccountHelper.findMatchingDeletedAccounts(bankAccount);
      res.map(async ba => {
        const decrypted = await gcloudKms.decrypt(ba.accountNumberAes256);
        expect(ba.deleted).to.not.equal(null);
        expect(bankAccount.accountNumber).to.equal(decrypted);
      });
    });

    it('should fail finding a matching deleted bank with micro completed', async () => {
      const bankAccount = await BankAccount.findByPk(1200);
      const res = await BankAccountHelper.findMatchingDeletedAccounts(bankAccount);
      expect(res.length).to.be.equal(0);
    });

    it('should succeed finding a matching bank partial routing match', async () => {
      const bankAccount = await BankAccount.findByPk(1202);

      const [account, routing] = bankAccount.accountNumberAes256.split('|');
      const accountWithZeros = `000${account}`;
      const modifiedAccountNumnerAes256 = `${accountWithZeros}|${routing}`;
      // this is the duplicate account in the db
      const deletedBankAccount = await BankAccount.findByPk(1203, { paranoid: false });
      await deletedBankAccount.update({
        accountNumberAes: modifiedAccountNumnerAes256,
        accountNumberAes256: modifiedAccountNumnerAes256,
      });

      sandbox
        .stub(gcloudKms, 'decrypt')
        .onFirstCall()
        .resolves(bankAccount.accountNumberAes256)
        .onSecondCall()
        .resolves(modifiedAccountNumnerAes256);

      const res = await BankAccountHelper.findMatchingDeletedAccounts(bankAccount);
      expect(res[0].id).to.equal(deletedBankAccount.id);
    });
  });
});
