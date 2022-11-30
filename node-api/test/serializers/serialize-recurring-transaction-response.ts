import { RecurringTransaction, User } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import 'mocha';
import * as sinon from 'sinon';
import { expect } from 'chai';
import 'chai-as-promised';
import factory from '../factories';
import {
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  up,
} from '../test-helpers';
import { serializeRecurringTransactionResponse } from '../../src/serialization/serialize-recurring-transaction-response';
import * as UserSetting from '../../src/domain/user-setting';
import * as RecurringTransactionDomain from '../../src/domain/recurring-transaction';
import BankingData from '../../src/lib/heath-client';
import { RecurringTransactionStatus } from '../../src/typings';
import AdvanceApprovalClient from '../../src/lib/advance-approval-client';

describe('SerializeRecurringTransaction ', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    sandbox
      .stub(AdvanceApprovalClient, 'createSingleApproval')
      .resolves(await factory.create('create-approval-success'));
    return up(sandbox);
  });

  afterEach(() => clean(sandbox));

  describe('serializeRecurringTransactionResponse', () => {
    // YYYY-MM-DD
    const yearMonthDayRegEx = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/;

    it('should format transactionDisplayName', async () => {
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction', {
        transactionDisplayName: 'Random Transaction',
      });

      await paycheck.update({ missed: moment() });

      const [user, bankAccount] = await Promise.all([
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      const result = await serializeRecurringTransactionResponse([paycheck], user, bankAccount);
      expect(result[0].transactionDisplayName).to.equal('Random');
    });

    it('should return a date string for the missed column', async () => {
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction');

      await paycheck.update({ missed: moment() });

      const [user, bankAccount] = await Promise.all([
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      const result = await serializeRecurringTransactionResponse([paycheck], user, bankAccount);

      expect(result[0].missed).to.match(yearMonthDayRegEx);
    });

    it('should return a date string for observations', async () => {
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 500,
      });

      const [, user, bankAccount] = await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: paycheck.bankAccountId,
          displayName: paycheck.transactionDisplayName,
          userId: paycheck.userId,
          amount: paycheck.userAmount,
          transactionDate: moment()
            .subtract(5, 'days')
            .format('YYYY-MM-DD'),
        }),
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      const result = await serializeRecurringTransactionResponse([paycheck], user, bankAccount);

      expect(result[0].observations[0].transactionDate).to.match(yearMonthDayRegEx);
    });

    it('should fallback to user display name when searching for observations', async () => {
      sandbox.restore();
      stubLoomisClient(sandbox);
      sandbox
        .stub(AdvanceApprovalClient, 'createSingleApproval')
        .resolves(await factory.create('create-approval-success'));
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction', {
        transactionDisplayName: null,
        userDisplayName: 'taco bell',
        userAmount: 500,
      });

      const [user, bankAccount] = await Promise.all([
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      const searchStub = sandbox.stub(BankingData, 'getBankTransactions').resolves([]);
      sandbox.stub(BankingData, 'getSingleBankTransaction').resolves(null);
      await serializeRecurringTransactionResponse([paycheck], user, bankAccount);
      const searchOpts = searchStub.firstCall.args[1];
      expect(searchOpts.displayName).to.deep.equal({ in: ['taco bell'] });
    });

    it('should return dates occording to user timezone if set', async () => {
      const today = moment('2020-02-01').tz('America/Los_Angeles');
      sandbox.stub(UserSetting, 'getLocalTime').returns(today);

      // interval: 'MONTHLY', params: [ 1 ],
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction', {
        userAmount: 500,
      });

      const [observation, user, bankAccount] = await Promise.all([
        factory.create('bank-transaction', {
          bankAccountId: paycheck.bankAccountId,
          displayName: paycheck.transactionDisplayName,
          userId: paycheck.userId,
          transactionDate: today.clone().subtract(5, 'days'),
        }),
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      sandbox
        .stub(RecurringTransactionDomain, 'getMatchingBankTransactions')
        .resolves([observation]);
      const result = await serializeRecurringTransactionResponse([paycheck], user, bankAccount);

      // January-Febuary because timezone shifts back a few hours
      expect(result[0].lastOccurrence).to.equal('2020-01-01');
      expect(result[0].nextOccurrence).to.equal('2020-02-01');
      expect(result[0].expected.expectedDate).to.equal('2020-02-01');
    });

    it('should format SINGLE_OBSERVATION status as VALID', async () => {
      const paycheck: RecurringTransaction = await factory.create('recurring-transaction', {
        status: RecurringTransactionStatus.SINGLE_OBSERVATION,
      });

      const [user, bankAccount] = await Promise.all([
        User.findByPk(paycheck.userId),
        paycheck.getBankAccount(),
      ]);

      const result = await serializeRecurringTransactionResponse([paycheck], user, bankAccount);
      expect(result[0].status).to.equal('VALID');
    });
  });
});
