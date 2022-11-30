import { AuditLog, BankAccount } from '../../../src/models';
import factory from '../../factories';
import { BankAccountAndRouting } from '../../../src/typings';
import { addAccountAndRouting } from '../../../src/domain/banking-data-sync';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { findDuplicateAccount } from '../../../src/domain/banking-data-sync/account-and-routing';
import { moment } from '@dave-inc/time-lib';
import * as BankingDataSync from '../../../src/domain/banking-data-sync/bank-transactions';
import { ConflictError } from '../../../src/lib/error';
import { clean, up } from '../../test-helpers';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';

describe('banking-data-sync/account-and-routing', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    await up();
  });

  afterEach(() => clean(sandbox));

  describe('addAccountAndRouting', () => {
    it('saves hashed & encrypted account/routing numbers, and last four to bank account', async () => {
      const bankAccount: BankAccount = await factory.create<BankAccount>('bank-account', {
        accountNumber: null,
        accountNumberAes256: null,
        lastFour: null,
      });
      const auth: BankAccountAndRouting = {
        account: '5928320523',
        routing: '00234242',
      };

      const encryptedAccountNumber = `encrypted-${auth.account}|${auth.routing}`;
      const hashedAccountNumber = `hashed-${auth.account}|${auth.routing}`;

      sandbox
        .stub(BankAccount, 'encryptAccountNumber')
        .withArgs(auth.account, auth.routing)
        .returns(encryptedAccountNumber);
      sandbox
        .stub(BankAccount, 'hashAccountNumber')
        .withArgs(auth.account, auth.routing)
        .returns(hashedAccountNumber);

      await addAccountAndRouting(bankAccount, auth);

      await bankAccount.reload();

      expect(bankAccount.accountNumber).to.eq(hashedAccountNumber);
      expect(bankAccount.accountNumberAes256).to.eq(encryptedAccountNumber);
      expect(bankAccount.lastFour).to.eq('0523');
    });
  });

  describe('findDuplicateAccount', () => {
    async function findDuplicateAccountWrapper(
      values: BankAccount,
      auth?: BankAccountAndRouting,
    ): Promise<BankAccount> {
      return findDuplicateAccount(values, auth);
    }

    it('should only run find duplicate using transactions if audit log for duplicate check has not been previously created', async () => {
      const spy = sandbox.spy();

      const bankAccount = await BankAccount.findByPk(2600);
      const userId = bankAccount.userId;
      await AuditLog.create({
        userId,
        type: 'DUPLICATE_BANK_ACCOUNT',
        eventUuid: bankAccount.externalId,
      });

      const partialBankAccount = BankAccount.build({
        userId: bankAccount.userId,
        bankConnectionId: bankAccount.bankConnectionId,
        authToken: 'token1',
        externalId: bankAccount.externalId,
      });
      const auth = { account: '2500', routing: '2500' };
      await findDuplicateAccountWrapper(partialBankAccount, auth);
      expect(spy.callCount).to.equal(0);
    });

    it('should find duplicate using account/routing', async () => {
      const duplicateBankAccountId = 1;
      const bankAccount = await BankAccount.findByPk(duplicateBankAccountId);

      const userId = 2500;
      const externalId = 'external_connection_2500';
      const partialBankAccount = BankAccount.build({
        userId,
        bankConnectionId: 2500,
        authToken: 'token2500',
        externalId,
      });

      const rand = () => Math.floor(Math.random() * 10000000000);
      const plaidTransactions = [
        {
          externalId: `external_id_${rand()}`,
          bankAccountExternalId: externalId,
          amount: Math.random() * 100,
          transactionDate: moment()
            .subtract(2, 'week')
            .format('YYYY-MM-DD'),
          pending: 0,
          externalName: `Transaction ${rand()}`,
        },
        {
          externalId: `external_id_${rand()}`,
          bankAccountExternalId: externalId,
          amount: Math.random() * 100,
          transactionDate: moment()
            .subtract(3, 'week')
            .format('YYYY-MM-DD'),
          pending: 0,
          externalName: `Transaction ${rand()}`,
        },
      ];
      sandbox.stub(BankingDataSync, 'fetchTransactions').resolves(plaidTransactions);

      const [account, routing] = bankAccount.accountNumberAes256.split('|');
      const auth = { account, routing };
      await expect(findDuplicateAccountWrapper(partialBankAccount, auth)).to.rejectedWith(
        ConflictError,
      );
      const al = await AuditLog.findOne({ where: { userId, type: 'DUPLICATE_BANK_ACCOUNT' } });
      expect(al).to.exist;
    });
  });
});
