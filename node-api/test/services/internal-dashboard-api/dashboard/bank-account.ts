import * as sinon from 'sinon';
import * as request from 'supertest';
import 'mocha';
import { expect } from 'chai';
import factory from '../../../factories';
import gcloudKms from '../../../../src/lib/gcloud-kms';
import { BankAccount } from '../../../../src/models';
import BankAccountHelper from '../../../../src/helper/bank-account';
import { moment } from '@dave-inc/time-lib';
import { MicroDeposit } from '@dave-inc/wire-typings';
import { BalanceLogCaller } from '../../../../src/typings';
import { backfillDailyBalances } from '../../../../src/domain/banking-data-sync/daily-balance-log';
import app from '../../../../src/services/internal-dashboard-api';
import {
  clean,
  up,
  stubBalanceLogClient,
  stubBankTransactionClient,
  withInternalUser,
} from '../../../test-helpers';

describe('/dashboard/bank_account/* endpoints', () => {
  const sandbox = sinon.createSandbox();

  // Clean before dummy data insert
  before(() => clean(sandbox));

  // Insert payment_method dummy data
  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);

    return up();
  });

  // Clean dummy data
  afterEach(() => clean(sandbox));

  describe('GET /dashboard/bank_account/details/:id', () => {
    let bankAccount: BankAccount;

    beforeEach(async () => {
      bankAccount = await factory.create('bank-account', {
        available: 100,
        current: 100,
      });
    });

    it('should pull transaction and balances for bank account', async () => {
      await factory.create('bank-transaction', {
        amount: 20,
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        transactionDate: moment()
          .subtract(2, 'month')
          .format('YYYY-MM-DD'),
      });
      await backfillDailyBalances(bankAccount, BalanceLogCaller.BankConnectionRefresh);

      const req = request(app)
        .get(`/dashboard/bank_account/details/${bankAccount.id}`)
        .expect(200);
      const { body } = await withInternalUser(req);

      const { transactions, balances } = body;

      expect(transactions.length).to.equal(1);
      expect(transactions[0].amount).to.equal(20);

      expect(balances.length).to.be.greaterThan(1);
      expect(balances[0].current).to.equal(bankAccount.available);
      expect(balances[0].available).to.equal(bankAccount.available);
    });

    it('should not include transactions past 90 days', async () => {
      const transaction = await factory.create('bank-transaction', {
        amount: 20,
        transactionDate: moment()
          .subtract(120, 'days')
          .format('YYYY-MM-DD'),
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
      });

      const req = request(app)
        .get(`/dashboard/bank_account/details/${bankAccount.id}`)
        .expect(200);
      const { body } = await withInternalUser(req);

      const { transactions } = body;
      const transactionIds = transactions.map((t: { id: number }) => t.id);
      expect(transactionIds).to.not.include(transaction.id);
    });
  });

  describe('PATCH /dashboard/bank_account/force_micro_deposit_complete/:id', () => {
    it('should complete micro deposit for matching deleted account', async () => {
      const bankAccountId = 1202;
      let bankAccount = await BankAccount.findByPk(bankAccountId);
      // Decrypt and be right
      sandbox.stub(gcloudKms, 'decrypt').resolves(`${bankAccount.accountNumber}`);

      const req = request(app)
        .patch(`/dashboard/bank_account/${bankAccountId}/force_micro_deposit_complete`)
        .expect(200);

      await withInternalUser(req);

      bankAccount = await BankAccount.findByPk(bankAccountId);
      expect(bankAccount.microDeposit).to.equal(MicroDeposit.COMPLETED);
    }).timeout(20000);
    it('should fail with completed micro deposit for NON-matching deleted account', async () => {
      const bankAccountId = 1201;
      // Decrypt and be wrong
      sandbox.stub(BankAccountHelper, 'findMatchingDeletedAccounts').returns([]);

      const req = request(app)
        .patch(`/dashboard/bank_account/${bankAccountId}/force_micro_deposit_complete`)
        .expect(409);

      await withInternalUser(req);
    }).timeout(20000);
  });
});
