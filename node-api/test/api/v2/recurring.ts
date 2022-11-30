import { Moment } from 'moment';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { insertNormalIncomeTransactions } from '../../../bin/dev-seed/utils';
import app from '../../../src/api';
import * as Bluebird from 'bluebird';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import 'chai-json-schema';
import 'mocha';
import factory from '../../factories';
import recurringTransactionSchema from '../../schema/recurring-transaction';
import { clean, stubBalanceLogClient, stubLoomisClient, up } from '../../test-helpers';
import { up as normalDevSeedUp } from '../../../bin/dev-seed/normal';
import {
  Advance,
  BankAccount,
  BankConnection,
  BankConnectionTransition,
  ExpectedTransaction,
  RecurringTransaction,
  sequelize,
  User,
} from '../../../src/models';
import * as RecurringTransactionDomain from '../../../src/domain/recurring-transaction';
import { RecurringTransactionStatus, TransactionType } from '../../../src/typings';
import { QueryTypes } from 'sequelize';
import { isBankHoliday, nextBankingDay } from '../../../src/lib/banking-days';
import AuditLog from '../../../src/models/audit-log';
import {
  PossibleRecurringTransactionResponse,
  RecurringTransactionInterval,
} from '@dave-inc/wire-typings';
import BankingData from '../../../src/lib/heath-client';
import stubBankTransactionClient, {
  clearBankTransactionStore,
  upsertBankTransactionForStubs,
} from '../../test-helpers/stub-bank-transaction-client';
import { BankTransaction } from '@dave-inc/heath-client';
import { insertFixtureBankTransactions } from '../../test-helpers/bank-transaction-fixtures';
import AdvanceApprovalClient from '../../../src/lib/advance-approval-client';

describe('/v2/bank_account/id/recurring_{expense|income}', () => {
  const sandbox = sinon.createSandbox();
  let createSingleApprovalStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(async () => {
    stubBalanceLogClient(sandbox);
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    insertFixtureBankTransactions();
    await up();
    createSingleApprovalStub = sandbox
      .stub(AdvanceApprovalClient, 'createSingleApproval')
      .resolves(await factory.create('create-approval-success'));
    sandbox.stub(AdvanceApprovalClient, 'preQualifyUser').resolves({ isDaveBankingEligible: true });
  });
  afterEach(() => clean(sandbox));

  describe('GET /bank_account/bankAccountId/recurring_transaction/transactionId', () => {
    it('should throw a NotFoundError if trying to get recurring transaction for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1200/recurring_transaction/1200')
        .set('Authorization', 'token-1100')
        .set('X-Device-Id', 'id-1100');
      expect(result.status).to.equal(404);
    });
    it('should get recurring transaction by id', async () => {
      const result = await request(app)
        .get('/v2/bank_account/1200/recurring_transaction/1200')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');
      expect(result.status).to.equal(200);
      expect(result.body.userDisplayName).to.equal('Name 1200');
    });
  });

  describe('GET /bank_account/id/recurring_expense', () => {
    it('should throw a NotFoundError if trying to get expenses for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/100/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(result.status).to.equal(404);
    });

    it('should get the recurring expenses for a bank account', async () => {
      createSingleApprovalStub.resolves(undefined);
      const result = await request(app)
        .get('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      const first = result.body[0];
      expect(first).to.be.jsonSchema(recurringTransactionSchema);
      expect(first.userDisplayName).to.equal('Name 1200');
      expect(first.userAmount).to.equal(-50);
      expect(first.expected.displayName).to.equal('Name 1200');
      expect(first.observations.length).to.equal(2);
      expect(first.status).to.equal(RecurringTransactionStatus.VALID);
      expect(first.advanceApproval).to.be.undefined;
    });
  });

  describe('GET /bank_account/id/recurring_income', () => {
    it('should throw a NotFoundError if trying to get incomes for another user', async () => {
      const result = await request(app)
        .get('/v2/bank_account/100/recurring_income')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(result.status).to.equal(404);
    });

    it('should get the recurring incomes for a bank account', async () => {
      sandbox.useFakeTimers(new Date(2020, 1, 15));

      const result = await request(app)
        .get('/v2/bank_account/1200/recurring_income')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(1);
      const first = result.body[0];
      expect(first).to.be.jsonSchema(recurringTransactionSchema);
      expect(first.userDisplayName).to.equal('Name 1201');
      expect(first.userAmount).to.equal(50);
      expect(first.expected.displayName).to.equal('Name 1201');
      expect(first.observations.length).to.equal(0);
      expect(first.status).to.equal(RecurringTransactionStatus.VALID);
      expect(first.advanceApproval.approved).to.equal(true);
      expect(first.advanceApproval.approvedAmounts.length).to.equal(3);
    });

    describe('with extra clean', () => {
      beforeEach(() => clean());

      it('should provide a falsey `advanceApproval` property if not eligible for advance', async () => {
        await normalDevSeedUp();
        createSingleApprovalStub.resolves(await factory.create('create-approval-failure'));
        const user = await User.findOne({ where: { phoneNumber: '+11234567890' } });
        const bankAccount = await BankAccount.findByPk(user.defaultBankAccountId);
        await RecurringTransaction.findByPk(bankAccount.mainPaycheckRecurringTransactionId);
        const userSession = await factory.create('user-session', { userId: user.id });
        const result = await request(app)
          .get(`/v2/bank_account/${bankAccount.id}/recurring_income`)
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId);
        const first = result.body[0];
        expect(first.status).to.equal(RecurringTransactionStatus.VALID);
        expect(first.advanceApproval.approved).to.equal(false);
      });

      it('should provide a truthy `advanceApproval` property if eligible for advance', async () => {
        const expectedAmounts = [75, 50, 25];
        await normalDevSeedUp();
        const user = await User.findOne({ where: { phoneNumber: '+11234567890' } });
        const bankAccount = await BankAccount.findByPk(user.defaultBankAccountId);
        await RecurringTransaction.findByPk(bankAccount.mainPaycheckRecurringTransactionId);
        const userSession = await factory.create('user-session', { userId: user.id });
        await Advance.update({ outstanding: 0 }, { where: { userId: user.id } });
        const result = await request(app)
          .get(`/v2/bank_account/${bankAccount.id}/recurring_income`)
          .set('Authorization', userSession.token)
          .set('X-Device-Id', userSession.deviceId);
        const first = result.body[0];
        expect(first.status).to.equal(RecurringTransactionStatus.VALID);
        expect(first.advanceApproval.approved).to.equal(true);
        expect(first.advanceApproval.approvedAmounts).to.deep.equal(expectedAmounts);
      });
    });
  });

  describe('POST /bank_account/id/recurring_expense', () => {
    it('should fail if required params are not sent', async () => {
      const body = {};
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(400);
    });

    it('should throw a NotFoundError if trying to create an expense for another user', async () => {
      const body = {
        bankTransactionId: 1200,
        userAmount: -20,
        interval: 'MONTHLY',
        params: [5],
      };
      const result = await request(app)
        .post('/v2/bank_account/1100/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(404);
    });

    it('should fail if the expense does not match patterns and no override flag is sent', async () => {
      const body = {
        bankTransactionId: 1200,
        userAmount: -20,
        interval: 'MONTHLY',
        params: [20],
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/different schedule/);
    });

    it('should succeed if the expense does not match patterns and the override flag is sent', async () => {
      const body = {
        bankTransactionId: 1200,
        userAmount: -10,
        interval: 'MONTHLY',
        params: [10],
        skipValidityCheck: true,
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(200);

      expect(result.body).to.be.jsonSchema(recurringTransactionSchema);
      expect(result.body.userDisplayName).to.equal('Name 1200');
      expect(result.body.userAmount).to.equal(-10);
      expect(result.body.interval).to.equal('MONTHLY');
      expect(result.body.params[0]).to.equal(10);
      expect(result.body.transactionDisplayName).to.equal('Name 1200');
      //TODO: expect to regenerate forecast
    });

    it('should set the type on the transaction EXPENSE', async () => {
      const body = {
        bankTransactionId: 1200,
        userAmount: -500,
        interval: 'MONTHLY',
        params: [10],
        skipValidityCheck: true,
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(200);
      const rec = await RecurringTransaction.findByPk(result.body.id);
      expect(rec.type).to.equal(TransactionType.EXPENSE);
    });

    it('should succeed if the expense matches patterns', async () => {
      const body = {
        bankTransactionId: 1203,
        userAmount: -20,
        interval: 'MONTHLY',
        params: [1],
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(200);

      expect(result.body).to.be.jsonSchema(recurringTransactionSchema);
      expect(result.body.userDisplayName).to.equal('Bacon');
      expect(result.body.userAmount).to.equal(-20);
      expect(result.body.interval).to.equal('MONTHLY');
      expect(result.body.transactionDisplayName).to.equal('Bacon');

      //TODO: expect to regenerate forecast
    });

    it('should succeed if there is no bank transaction to test against', async () => {
      const body = {
        userAmount: -20,
        interval: 'MONTHLY',
        params: [5],
        userDisplayName: 'Paw clippers',
        skipValidityCheck: true,
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(200);

      expect(result.body.transactionDisplayName).to.equal('');
      expect(result.body.userDisplayName).to.equal('Paw clippers');
      expect(result.body.params[0]).to.equal(5);
      expect(result.body.interval).to.equal('MONTHLY');
    });

    it('should succeed if there are multiple bankless recurring transactions inserted', async () => {
      const [result1, result2] = await Promise.all([
        request(app)
          .post('/v2/bank_account/1200/recurring_expense')
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .send({
            userAmount: -20,
            interval: 'MONTHLY',
            params: [5],
            userDisplayName: 'Paw clippers',
            skipValidityCheck: true,
          }),
        request(app)
          .post('/v2/bank_account/1200/recurring_expense')
          .set('Authorization', 'token-1200')
          .set('X-Device-Id', 'id-1200')
          .send({
            userAmount: -40,
            interval: 'MONTHLY',
            params: [10],
            userDisplayName: 'Paw clippers XL',
            skipValidityCheck: true,
          }),
      ]);

      expect(result1.status).to.equal(200);
      expect(result1.body.transactionDisplayName).to.equal('');

      expect(result2.status).to.equal(200);
      expect(result2.body.transactionDisplayName).to.equal('');
    });
  });

  describe('POST /bank_account/id/recurring_expense/bulk', () => {
    it('should fail if required params are not sent', async () => {
      const body = [{ test: 'yoooooo' }];
      const result = await request(app)
        .post(`/v2/bank_account/1200/recurring_expense/bulk`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(400);
    });

    it('should throw a NotFoundError if trying to create expenses for another user', async () => {
      const body = [
        {
          bankTransactionId: 1200,
          userAmount: -20,
          interval: 'MONTHLY',
          params: [5],
        },
      ];
      const result = await request(app)
        .post(`/v2/bank_account/123456/recurring_expense/bulk`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(404);
    });

    it('should fail if the transactions provided is not an array of objects', async () => {
      const body = {
        userAmount: -10,
        interval: 'MONTHLY',
        params: [20],
        userDisplayName: 'Horseshoes',
      };
      const result = await request(app)
        .post(`/v2/bank_account/1200/recurring_expense/bulk`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Provided transactions need to be an array of objects/);
    });

    it('should return an array of objects with the saved recurring transactions', async () => {
      const body = [
        {
          userAmount: -20,
          interval: 'MONTHLY',
          params: [5],
          userDisplayName: 'Paw clippers',
          bankTransactionId: 1200,
        },
        {
          userAmount: -10,
          interval: 'MONTHLY',
          params: [20],
          userDisplayName: 'Horseshoes',
          bankTransactionId: 1203,
        },
      ];
      const result = await request(app)
        .post(`/v2/bank_account/1200/recurring_expense/bulk`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(body);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.an('array');
      expect(result.body.length).to.be.gt(0);
      expect(result.body[0].expected).to.not.be.undefined;
    });

    it('should return nothing if the transactions was not updated', async () => {
      const account = await factory.create('checking-account');
      const bt = await factory.create('bank-transaction', {
        amount: -50,
        bankAccountId: account.id,
        userId: account.userId,
      });
      await factory.create('recurring-transaction', {
        bankAccountId: account.id,
        userId: account.userId,
        transactionDisplayName: bt.displayName,
        userAmount: -10,
        interval: 'MONTHLY',
        params: [5],
        userDisplayName: 'Paw clippers',
      });
      const body = [
        {
          userAmount: -10,
          interval: 'MONTHLY',
          params: [5],
          userDisplayName: 'Paw clippers',
          bankTransactionId: bt.id,
        },
      ];
      const result = await request(app)
        .post(`/v2/bank_account/${account.id}/recurring_expense/bulk`)
        .set('Authorization', account.userId)
        .set('X-Device-Id', account.userId)
        .send(body)
        .expect(200);

      expect(result.body).to.be.an('array');
      expect(result.body.length).to.equal(0);
    });
  });

  describe('POST /bank_account/id/recurring_income', () => {
    it('should succeed', async () => {
      const data = {
        bankAccountId: 1200,
        userDisplayName: 'Income',
        userAmount: 20,
        bankTransactionId: 1201,
        interval: 'semi_monthly',
        params: [
          moment()
            .subtract(15, 'days')
            .date(),
          moment().date() > 28 ? 28 : moment().date(),
        ].sort(),
        skipValidityCheck: false,
      };
      if (moment().date() > 28) {
        const transaction = await BankingData.getSingleBankTransaction(1200, {
          transactionDate: moment().format('YYYY-MM-DD'),
        });
        transaction.transactionDate = moment()
          .date(28)
          .format('YYYY-MM-DD');
        upsertBankTransactionForStubs(transaction);
      }
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(data);

      expect(result.status).to.equal(200);

      expect(result.body.transactionDisplayName).to.equal('Income');
      expect(result.body.userDisplayName).to.equal('Income');
      expect(result.body.interval).to.equal('SEMI_MONTHLY');
    });

    context('when the user has a transitioning Dave Banking account', () => {
      let bankAccount: BankAccount;
      let bankConnection: BankConnection;
      let bankConnectionTransition: BankConnectionTransition;
      let bankTransaction: BankTransaction;
      let data: any;
      const sevenDaysAgo = moment().subtract(7, 'days');
      if (sevenDaysAgo.date() > 28) {
        sevenDaysAgo.date(28);
      }
      const date = nextBankingDay(sevenDaysAgo, -1);
      const displayName = "Pilates. It's for your abs.";
      // TODO https://demoforthedaves.atlassian.net/browse/BNS-208
      // Some punctuation characters within expenses are being replaced with space characters
      const formattedDisplayName = 'Pilates It S Your Abs';

      beforeEach(async () => {
        bankConnection = await factory.create('bank-of-dave-bank-connection');
        await Promise.all([
          (async () => {
            bankAccount = await factory.create('checking-account', {
              bankConnectionId: bankConnection.id,
              userId: bankConnection.userId,
            });
            bankTransaction = await factory.create('bank-transaction', {
              bankAccountId: bankAccount.id,
              userId: bankAccount.userId,
              transactionDate: date,
              displayName,
              externalId: date.format('YYYY-MM-DD'),
              externalName: displayName,
              amount: 100,
              pending: false,
            });
            if (moment().date() > 28) {
              const transaction = await BankingData.getSingleBankTransaction(bankAccount.id, {
                transactionDate: moment().format('YYYY-MM-DD'),
              });

              if (transaction) {
                transaction.transactionDate = moment()
                  .date(28)
                  .format('YYYY-MM-DD');
                upsertBankTransactionForStubs(transaction);
              }
            }
          })(),
          (async () => {
            const otherBankConnection: BankConnection = await factory.create('bank-connection', {
              userId: bankConnection.userId,
            });
            const otherBankAccount: BankAccount = await factory.create('checking-account', {
              bankConnectionId: otherBankConnection.id,
              userId: otherBankConnection.userId,
            });
            bankConnectionTransition = await BankConnectionTransition.create({
              fromBankConnectionId: otherBankConnection.id,
              fromDefaultBankAccountId: otherBankAccount.id,
              toBankConnectionId: bankConnection.id,
              hasReceivedFirstPaycheck: true,
              hasReceivedRecurringPaycheck: false,
            });
          })(),
        ]);

        let dayOfMonth = nextBankingDay(date, -1).date();
        if (dayOfMonth > 28) {
          dayOfMonth = -1;
        }
        data = {
          bankAccountId: bankAccount.id,
          userDisplayName: 'Income',
          userAmount: bankTransaction.amount + 5,
          bankTransactionId: bankTransaction.id,
          interval: 'monthly',
          params: [dayOfMonth],
          skipValidityCheck: false,
        };
      });

      it('should create verified paychecks based on a single transaction', async () => {
        const { body } = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/recurring_expense`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(data)
          .expect(200);

        expect(body.transactionDisplayName).to.equal(formattedDisplayName);
        expect(body.userAmount).to.equal(data.userAmount);
        expect(body.userDisplayName).to.equal(data.userDisplayName);
        expect(body.interval).to.equal('MONTHLY');
        expect(body.params).to.deep.equal(data.params);
        expect(body.status).to.equal(RecurringTransactionStatus.VALID);
        expect(body.observations).to.have.lengthOf(1);
      });

      it('should not create verified paychecks without any transactions', async () => {
        await clearBankTransactionStore();

        const { body } = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/recurring_expense`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(data)
          .expect(404);

        expect(body.message).to.match(/Bank Transaction not found/);
      });

      it('should not create single-transaction verified paychecks if user already has income', async () => {
        await bankConnectionTransition.update({ hasReceivedRecurringPaycheck: true });

        const { body } = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/recurring_expense`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(data)
          .expect(400);

        expect(body.message).to.match(/Must have at least 2 matching paychecks/);
      });

      it('should not create verified paychecks if recurring paychecks exist', async () => {
        await bankConnectionTransition.update({ hasReceivedRecurringPaycheck: true });

        const { body } = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/recurring_expense`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(data)
          .expect(400);

        expect(body.message).to.match(/Must have at least 2 matching paychecks/);
      });
    });

    context('when saving recurring transactions from a previous account', () => {
      let fromBankConnection: BankConnection;
      let fromBankAccount: BankAccount;
      let toBankConnection: BankConnection;
      let toBankAccount: BankAccount;
      let bankConnectionTransition: BankConnectionTransition;

      beforeEach(async () => {
        fromBankConnection = await factory.create('bank-connection');
        fromBankAccount = await factory.create('checking-account', {
          bankConnectionId: fromBankConnection.id,
          userId: fromBankConnection.userId,
        });
        toBankConnection = await factory.create('bank-connection', {
          userId: fromBankConnection.userId,
        });
        toBankAccount = await factory.create('checking-account', {
          bankConnectionId: toBankConnection.id,
          userId: fromBankConnection.userId,
        });
        bankConnectionTransition = await BankConnectionTransition.create({
          fromDefaultBankAccountId: fromBankAccount.id,
          fromBankConnectionId: fromBankConnection.id,
          toBankConnectionId: toBankConnection.id,
        });
      });

      it('should create a paycheck with a status of PENDING_VERIFICATION when provided a valid transaction display name', async () => {
        const { recurringTransactionId } = await insertNormalIncomeTransactions(
          fromBankConnection.userId,
          fromBankAccount.id,
          {
            amount: 500.01,
            name: 'Royal Candy Budget',
          },
          true,
        );
        const fromRecurringTransaction = await RecurringTransaction.findByPk(
          recurringTransactionId,
        );

        const data = {
          userDisplayName: 'Steven likes the Care Bears',
          userAmount: fromRecurringTransaction.userAmount,
          fromTransactionDisplayName: fromRecurringTransaction.transactionDisplayName,
          interval: fromRecurringTransaction.interval,
          params: fromRecurringTransaction.params,
        };

        const { body } = await request(app)
          .post(`/v2/bank_account/${toBankAccount.id}/recurring_income`)
          .set('Authorization', fromBankConnection.userId.toString())
          .set('X-Device-Id', fromBankConnection.userId.toString())
          .send(data)
          .expect(200);

        expect(body.status).to.equal(RecurringTransactionStatus.PENDING_VERIFICATION);
        expect(body.transactionDisplayName).to.equal(
          fromRecurringTransaction.transactionDisplayName,
        );
        expect(body.userAmount).to.equal(500.01);
        expect(body.userDisplayName).to.equal(data.userDisplayName);

        const recurringTransaction = await RecurringTransaction.findByPk(body.id);
        expect(recurringTransaction.status).to.equal(
          RecurringTransactionStatus.PENDING_VERIFICATION,
        );
      });

      it("should err when a bank connection transition doesn't exist", async () => {
        await bankConnectionTransition.destroy();
        const { recurringTransactionId } = await insertNormalIncomeTransactions(
          fromBankConnection.userId,
          fromBankAccount.id,
          {
            amount: 500.01,
            name: 'Royal Candy Budget',
          },
          true,
        );
        const fromRecurringTransaction = await RecurringTransaction.findByPk(
          recurringTransactionId,
        );

        const data = {
          userDisplayName: 'Steven likes the Care Bears',
          userAmount: fromRecurringTransaction.userAmount,
          fromTransactionDisplayName: fromRecurringTransaction.transactionDisplayName,
          interval: fromRecurringTransaction.interval,
          params: fromRecurringTransaction.params,
        };

        const { body } = await request(app)
          .post(`/v2/bank_account/${toBankAccount.id}/recurring_income`)
          .set('Authorization', fromBankConnection.userId.toString())
          .set('X-Device-Id', fromBankConnection.userId.toString())
          .send(data)
          .expect(404);

        expect(body.message).to.match(/No accounts to transition from/);
      });

      it("should err when the transaction display name doesn't exist for the user", async () => {
        const data = {
          userDisplayName: 'Steven likes the Care Bears',
          userAmount: 99,
          fromTransactionDisplayName: 'LION HEART',
          interval: 'MONTHLY',
          params: [1],
        };

        const { body } = await request(app)
          .post(`/v2/bank_account/${toBankAccount.id}/recurring_income`)
          .set('Authorization', fromBankConnection.userId.toString())
          .set('X-Device-Id', fromBankConnection.userId.toString())
          .send(data)
          .expect(404);

        expect(body.message).to.match(/Possible recurring transaction not found/);
      });

      it("should err if the old recurring transaction doesn't belong to the default transitioned-from account", async () => {
        const otherBankAccount: BankAccount = await factory.create('checking-account', {
          bankConnectionId: fromBankConnection.id,
          userId: fromBankConnection.userId,
        });

        const { recurringTransactionId } = await insertNormalIncomeTransactions(
          fromBankConnection.userId,
          otherBankAccount.id,
          {
            amount: 500.01,
            name: 'Royal Candy Budget',
          },
          true,
        );
        const fromRecurringTransaction = await RecurringTransaction.findByPk(
          recurringTransactionId,
        );

        const data = {
          userDisplayName: 'Steven likes the Care Bears',
          userAmount: fromRecurringTransaction.userAmount,
          fromTransactionDisplayName: fromRecurringTransaction.transactionDisplayName,
          interval: fromRecurringTransaction.interval,
          params: fromRecurringTransaction.params,
          skipValidityCheck: false,
        };

        const { body } = await request(app)
          .post(`/v2/bank_account/${toBankAccount.id}/recurring_income`)
          .set('Authorization', fromBankConnection.userId.toString())
          .set('X-Device-Id', fromBankConnection.userId.toString())
          .send(data)
          .expect(404);

        expect(body.message).to.match(/Possible recurring transaction not found/);
      });
    });

    it('should set the correct type INCOME', async () => {
      const data = {
        bankAccountId: 1200,
        userDisplayName: 'Income',
        userAmount: 20,
        bankTransactionId: 1201,
        interval: 'monthly',
        params: [15],
        skipValidityCheck: true,
      };
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(data);

      expect(result.status).to.equal(200);
      const rec = await RecurringTransaction.findByPk(result.body.id);
      expect(rec.type).to.equal(TransactionType.INCOME);
    });

    it('should return the correct id if upserted twice', async () => {
      const data = {
        bankAccountId: 1200,
        userDisplayName: 'Income',
        userAmount: 20,
        bankTransactionId: 1201,
        interval: 'semi_monthly',
        params: [
          moment()
            .subtract(15, 'days')
            .date(),
          moment().date() > 28 ? 28 : moment().date(),
        ].sort(),
        skipValidityCheck: false,
      };
      if (moment().date() > 28) {
        const transaction = await BankingData.getSingleBankTransaction(1200, {
          transactionDate: moment().format('YYYY-MM-DD'),
        });
        if (transaction) {
          transaction.transactionDate = moment()
            .date(28)
            .format('YYYY-MM-DD');
          upsertBankTransactionForStubs(transaction);
        }
      }
      const result = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(data);

      expect(result.status).to.equal(200);
      const duplicate = await request(app)
        .post('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send(data);

      expect(result.body.id).to.equal(duplicate.body.id);
    });

    it('should fail if params are too close together', async () => {
      const result = await request(app)
        .post(`/v2/bank_account/1200/recurring_income`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send({
          params: [27, -1],
          interval: 'SEMI_MONTHLY',
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain('Semi Monthly Params must be at least 7 days apart.');
    });

    it('should fail if params are below -1', async () => {
      const result = await request(app)
        .post(`/v2/bank_account/1200/recurring_income`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send({
          params: [15, -2],
          interval: 'SEMI_MONTHLY',
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain('Monthly Params cannot be less than -1');
    });
  });

  describe('PATCH /bank_account/id/recurring_expense/id', () => {
    it('should update recurring and all expected transactions', async () => {
      const trans = await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [10],
        userAmount: -20,
      });
      await factory.create('user-session', {
        userId: trans.userId,
        deviceId: trans.userId,
        token: trans.userId,
      });
      await RecurringTransactionDomain.getNextExpectedTransaction(trans);
      const all = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: trans.id },
      });
      expect(all.length).to.equal(1);
      expect(all[0].expectedDate.date()).to.equal(10);
      expect(all[0].displayName).not.to.equal('BACON');

      const result = await request(app)
        .patch(`/v2/bank_account/${trans.bankAccountId}/recurring_expense/${trans.id}`)
        .set('Authorization', trans.userId)
        .set('X-Device-Id', trans.userId)
        .send({
          params: [5],
          interval: 'MONTHLY',
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        });

      expect(result.status).to.equal(200);

      const updated = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: trans.id },
      });
      expect(updated[0].expectedDate.date()).to.equal(5);
      expect(updated[0].displayName).to.equal('BACON');
    });

    it('should create an audit log', async () => {
      const trans = await factory.create('recurring-transaction', {
        interval: 'MONTHLY',
        params: [10],
        userAmount: -20,
      });

      await request(app)
        .patch(`/v2/bank_account/${trans.bankAccountId}/recurring_expense/${trans.id}`)
        .set('Authorization', trans.userId)
        .set('X-Device-Id', trans.userId)
        .send({
          params: [5],
          interval: 'MONTHLY',
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        })
        .expect(200);

      const logs = await AuditLog.findAll({
        where: { userId: trans.userId },
      });
      expect(logs.length).to.eq(1);
      expect(logs[0].type).to.eq('USER_RECURRING_TRANSACTION_UPDATE');
      expect(logs[0].extra.updated.userDisplayName).to.eq('BACON');
    });

    it('should fail if interval not provided', async () => {
      const result = await request(app)
        .patch(`/v2/bank_account/1200/recurring_expense/1200`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send({
          params: [5],
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain('Required parameters not provided: interval');
    });

    it('should fail if params are too close together', async () => {
      const result = await request(app)
        .patch(`/v2/bank_account/1200/recurring_expense/1200`)
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200')
        .send({
          params: [-1, 4],
          interval: 'SEMI_MONTHLY',
          skipValidityCheck: true,
          userDisplayName: 'BACON',
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.contain('Semi Monthly Params must be at least 7 days apart.');
    });

    context('when the user has a transitioning Dave Banking account', () => {
      let bankAccount: BankAccount;
      let bankConnection: BankConnection;
      let bankConnectionTransition: BankConnectionTransition;
      let bankTransaction: BankTransaction;
      let data: any;
      let date = moment().subtract(7, 'days');
      while (isWeekend(date) || isBankHoliday(date) || date.date() > 28) {
        // Need a valid banking day within the past week in order to
        // claim a weekly paycheck schedule.
        date = nextBankingDay(date, 1);
        if (date.date() > 28) {
          date = nextBankingDay(date.add(15, 'days').startOf('month'), 2);
        }
      }
      let transactionDate = nextBankingDay(date, -1);
      if (transactionDate.date() > 28) {
        transactionDate = nextBankingDay(transactionDate.endOf('month'), -1);
      }
      const displayName = "Pilates. It's for your abs.";
      // TODO https://demoforthedaves.atlassian.net/browse/BNS-208
      // Some punctuation characters within expenses are being replaced with space characters
      const formattedDisplayName = 'Pilates It S Your Abs';
      let patchData: any;
      let recurringTransactionBody: any;

      beforeEach(async () => {
        bankConnection = await factory.create('bank-of-dave-bank-connection');
        await Promise.all([
          (async () => {
            bankAccount = await factory.create('checking-account', {
              bankConnectionId: bankConnection.id,
              userId: bankConnection.userId,
            });
            bankTransaction = await factory.create('bank-transaction', {
              bankAccountId: bankAccount.id,
              userId: bankAccount.userId,
              transactionDate,
              displayName,
              externalId: date.format('YYYY-MM-DD'),
              externalName: displayName,
              amount: 100,
              pending: false,
            });
          })(),
          (async () => {
            const otherBankConnection: BankConnection = await factory.create('bank-connection', {
              userId: bankConnection.userId,
            });
            const otherBankAccount: BankAccount = await factory.create('checking-account', {
              bankConnectionId: otherBankConnection.id,
              userId: otherBankConnection.userId,
            });
            bankConnectionTransition = await BankConnectionTransition.create({
              fromBankConnectionId: otherBankConnection.id,
              fromDefaultBankAccountId: otherBankAccount.id,
              toBankConnectionId: bankConnection.id,
              hasReceivedFirstPaycheck: true,
              hasReceivedRecurringPaycheck: false,
            });
          })(),
        ]);

        let dayOfMonth = nextBankingDay(date, -1).date();
        if (dayOfMonth > 28) {
          dayOfMonth = -1;
        }

        data = {
          bankAccountId: bankAccount.id,
          userDisplayName: 'Income',
          userAmount: bankTransaction.amount + 5,
          bankTransactionId: bankTransaction.id,
          interval: 'monthly',
          params: [dayOfMonth],
          skipValidityCheck: false,
        };

        patchData = {
          interval: 'monthly',
          params: [dayOfMonth],
          userAmount: 9001,
          userDisplayName: 'Rickety Cricket',
        };

        ({ body: recurringTransactionBody } = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/recurring_expense`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(data)
          .expect(200));
      });

      it('should update verified paychecks based on a single transaction on a monthly schedule', async () => {
        const { body } = await request(app)
          .patch(
            `/v2/bank_account/${bankAccount.id}/recurring_expense/${recurringTransactionBody.id}`,
          )
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(patchData)
          .expect(200);

        expect(body.transactionDisplayName).to.equal(formattedDisplayName);
        expect(body.userAmount).to.equal(patchData.userAmount);
        expect(body.userDisplayName).to.equal(patchData.userDisplayName);
        expect(body.interval).to.equal('MONTHLY');
        expect(body.params).to.deep.equal(patchData.params);
        expect(body.status).to.equal(RecurringTransactionStatus.VALID);
        expect(body.observations).to.have.lengthOf(1);
      });

      it('should update verified paychecks based on a single transaction on a weekly schedule', async () => {
        patchData = {
          interval: 'weekly',
          params: [date.format('dddd').toLowerCase()],
          userAmount: 9001,
          userDisplayName: 'Rickety Cricket',
          rollDirection: 0,
        };

        const { body } = await request(app)
          .patch(
            `/v2/bank_account/${bankAccount.id}/recurring_expense/${recurringTransactionBody.id}`,
          )
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(patchData)
          .expect(200);

        expect(body.transactionDisplayName).to.equal(formattedDisplayName);
        expect(body.userAmount).to.equal(patchData.userAmount);
        expect(body.userDisplayName).to.equal(patchData.userDisplayName);
        expect(body.interval).to.equal('WEEKLY');
        expect(body.params).to.deep.equal(patchData.params);
        expect(body.status).to.equal(RecurringTransactionStatus.VALID);
        expect(body.observations).to.have.lengthOf(1);
      });

      it('should not update verified paycheck based on a single transaction if the schedule is off by two weekdays', async () => {
        patchData = {
          interval: 'weekly',
          params: [
            date
              .clone()
              .add(2, 'day')
              .format('dddd')
              .toLowerCase(),
          ],
          userAmount: 9001,
          userDisplayName: 'Rickety Cricket',
        };

        const { body } = await request(app)
          .patch(
            `/v2/bank_account/${bankAccount.id}/recurring_expense/${recurringTransactionBody.id}`,
          )
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(patchData)
          .expect(400);

        expect(body.message).to.match(
          /I'm seeing a different schedule for this transaction, please try again/,
        );
      });

      it('should not update paychecks if transition has received a recurring paycheck', async () => {
        await bankConnectionTransition.update({ hasReceivedRecurringPaycheck: true });

        const { body } = await request(app)
          .patch(
            `/v2/bank_account/${bankAccount.id}/recurring_expense/${recurringTransactionBody.id}`,
          )
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .send(patchData)
          .expect(400);

        expect(body.message).to.match(/Must have at least 2 matching paychecks/);
      });
    });
  });

  describe('DELETE /bank_account/id/recurring_expense/id', () => {
    it('should delete the recurring expense', async () => {
      const initialResult = await request(app)
        .get('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(initialResult.status).to.equal(200);
      expect(initialResult.body).to.be.an('array');
      expect(initialResult.body.length).to.equal(1);

      const deleteResult = await request(app)
        .delete('/v2/bank_account/1200/recurring_expense/1200')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(deleteResult.status).to.equal(200);

      const finalResult = await request(app)
        .get('/v2/bank_account/1200/recurring_expense')
        .set('Authorization', 'token-1200')
        .set('X-Device-Id', 'id-1200');

      expect(finalResult.status).to.equal(200);
      expect(finalResult.body).to.be.an('array');
      expect(finalResult.body.length).to.equal(0);
    });
  });

  describe('DELETE /bank_account/id/recurring_income/id', () => {
    it('should not overwrite the existing main_paycheck_recurring_id', async () => {
      let bankAccounts: any;
      const recurring = await factory.create('recurring-transaction', {
        userId: 701,
        bankAccountId: 708,
      });
      await BankAccount.update(
        { mainPaycheckRecurringTransactionId: recurring.id },
        { where: { id: 708 } },
      );

      await request(app)
        .post('/v2/bank_account/708/recurring_income')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .send({
          bankTransactionId: 703,
          interval: 'MONTHLY',
          params: [parseInt(moment().format('D'), 10)],
          skipValidityCheck: true,
        });
      bankAccounts = await sequelize.query<any>('SELECT * FROM bank_account WHERE id = 708', {
        type: QueryTypes.SELECT,
      });
      expect(bankAccounts[0].main_paycheck_recurring_transaction_id).to.equal(recurring.id);
    });

    it('should mark the recurring transaction as deleted', async () => {
      const recurring = await factory.create('recurring-transaction', {
        userId: 701,
        bankAccountId: 708,
        userAmount: 200,
      });
      await factory.create('expected-transaction', {
        recurringTransactionId: recurring.id,
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        expectedDate: moment(),
      });
      const prior = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: recurring.id },
      });
      expect(prior.length).to.equal(1);
      await request(app)
        .del(`/v2/bank_account/708/recurring_income/${recurring.id}`)
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .expect(200);
      const nonDeleted = await RecurringTransaction.findAll({
        where: { id: recurring.id },
      });
      expect(nonDeleted.length).to.equal(0);
      const deleted = await RecurringTransaction.findAll({
        where: { id: recurring.id },
        paranoid: false,
      });
      expect(deleted.length).to.equal(1);
      expect(deleted[0].deleted.toDate()).to.be.lessThan(moment().toDate());
    });

    it('should make next largest income main when txn is deleted and no change if not main', async () => {
      await BankAccount.update({ mainPaycheckRecurringTransactionId: 118 }, { where: { id: 707 } });

      await request(app)
        .del('/v2/bank_account/707/recurring_income/118')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');
      const bankAccounts2 = await sequelize.query<any>(
        'SELECT * FROM bank_account WHERE id = 707',
        {
          type: QueryTypes.SELECT,
        },
      );
      expect(bankAccounts2[0].main_paycheck_recurring_transaction_id).to.equal(120);
    });

    it('should nullify when txn is deleted w/o alternatives', async () => {
      const result = await request(app)
        .patch('/v2/bank_account/706')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .send({ mainPaycheckRecurringTransactionId: 117 });

      expect(result.status).to.equal(200);
      const bankAccount0 = await BankAccount.findByPk(706);
      expect(bankAccount0.mainPaycheckRecurringTransactionId).to.equal(117);

      const result2 = await request(app)
        .del('/v2/bank_account/706/recurring_income/117')
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701');

      expect(result2.status).to.equal(200);
      const bankAccount1 = await BankAccount.findByPk(706);
      expect(bankAccount1.mainPaycheckRecurringTransactionId).to.equal(null);
    });

    it('should delete any future expected transactions', async () => {
      const recurring = await factory.create('recurring-transaction', {
        userId: 701,
        bankAccountId: 708,
        userAmount: 200,
      });
      await factory.create('expected-transaction', {
        recurringTransactionId: recurring.id,
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        expectedDate: moment(),
      });
      const prior = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: recurring.id },
      });
      expect(prior.length).to.equal(1);
      await request(app)
        .del(`/v2/bank_account/708/recurring_income/${recurring.id}`)
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .expect(200);
      const expected = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: recurring.id },
      });
      expect(expected.length).to.equal(0);
    });

    it('should update a transaction from pending to settled when detaching', async () => {
      const recurring = await factory.create('recurring-transaction', {
        userId: 701,
        bankAccountId: 708,
        userAmount: 200,
      });
      await factory.create('expected-transaction', {
        recurringTransactionId: recurring.id,
        bankAccountId: recurring.bankAccountId,
        userId: recurring.userId,
        expectedDate: moment().subtract(1, 'day'),
        pendingDate: moment(),
        settledDate: null,
      });
      const prior = await ExpectedTransaction.findAll({
        where: { recurringTransactionId: recurring.id },
      });
      expect(prior.length).to.equal(1);
      await request(app)
        .del(`/v2/bank_account/708/recurring_income/${recurring.id}`)
        .set('Authorization', 'token-701')
        .set('X-Device-Id', 'id-701')
        .expect(200);
      const expected = await ExpectedTransaction.findAll({
        where: { userId: recurring.userId },
        paranoid: false,
      });
      expect(expected.length).to.equal(1);
      expect(expected[0].settledDate.format('YYYY-MM-DD')).to.equal(
        moment(expected[0].pendingDate).format('YYYY-MM-DD'),
      );
    });
  });

  describe('Detect paychecks', () => {
    it('should detect all paycheck schedules', async () => {
      const bankAccount = await factory.create('checking-account');
      sandbox.useFakeTimers(new Date(2019, 9, 27).getTime());
      const displayName = 'DISPLAY NAME';
      const currentDate = '2019-10-25';
      const dates = [
        moment(currentDate).subtract(7, 'days'),
        moment(currentDate),
        moment(currentDate).subtract(14, 'days'),
      ].map(d => nextBankingDay(d, -1));
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });
      const result = await request(app)
        .get(`/v2/bank_account/${bankAccount.id}/paychecks`)
        .set('Authorization', bankAccount.userId)
        .set('X-Device-Id', bankAccount.userId);

      const [transaction] = result.body;
      expect(transaction.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(transaction.params[0]).to.equal(
        moment(currentDate)
          .format('dddd')
          .toLowerCase(),
      );
      expect(transaction.rollDirection).to.equal(-1);
      expect(transaction.displayName).to.equal(displayName);
      expect(transaction.bankTransactionId).to.not.be.undefined;
      expect(moment(transaction.nextOccurrence).isSameOrAfter(moment(currentDate), 'day')).to.eq(
        true,
      );
      expect(transaction.observations).to.have.lengthOf(dates.length);
      const observationDates = dates.map(date => date.format('YYYY-MM-DD'));
      for (const observation of transaction.observations) {
        expect(observation.amount).to.equal(100);
        expect(observation.displayName.toLowerCase()).to.equal(displayName.toLowerCase());
        const dateIndex = observationDates.indexOf(observation.transactionDate);
        expect(dateIndex).to.not.equal(-1);
        observationDates.splice(dateIndex, 1);
      }
      expect(observationDates).to.have.lengthOf(0);
    });

    context('when the user has a Dave Banking account', () => {
      let bankAccount: BankAccount;
      let bankConnection: BankConnection;
      let bankConnectionTransition: BankConnectionTransition;
      let bankTransaction: BankTransaction;
      const date = nextBankingDay(moment().subtract(7, 'days'), -1);
      const displayName = "Pilates. It's for your abs.";

      beforeEach(async () => {
        bankConnection = await factory.create('bank-of-dave-bank-connection');
        bankAccount = await factory.create('checking-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
        });
        const otherBankConnection: BankConnection = await factory.create('bank-connection', {
          userId: bankConnection.userId,
        });
        const otherBankAccount: BankAccount = await factory.create('checking-account', {
          bankConnectionId: otherBankConnection.id,
          userId: otherBankConnection.userId,
        });
        bankConnectionTransition = await BankConnectionTransition.create({
          fromBankConnectionId: otherBankConnection.id,
          fromDefaultBankAccountId: otherBankAccount.id,
          toBankConnectionId: bankConnection.id,
          hasReceivedFirstPaycheck: true,
          hasReceivedRecurringPaycheck: false,
        });
        bankTransaction = await factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });

      it('should display paychecks with a single transaction with a best-guess bi-weekly schedule', async () => {
        expect(bankConnectionTransition.hasReceivedRecurringPaycheck).to.equal(false);

        const { body } = await request(app)
          .get(`/v2/bank_account/${bankAccount.id}/paychecks`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .expect(200);

        expect(body).to.have.lengthOf(1);
        const [possibleRecurringTransaction] = body as PossibleRecurringTransactionResponse[];
        expect(possibleRecurringTransaction.displayName).to.equal(displayName);
        expect(possibleRecurringTransaction.foundSchedule).to.equal(false);
      });

      it('should not display paychecks with a single transaction if recurring paychecks have been found', async () => {
        await bankConnectionTransition.update({
          hasReceivedRecurringPaycheck: true,
        });

        expect(bankConnectionTransition.hasReceivedRecurringPaycheck).to.equal(true);

        const { body } = await request(app)
          .get(`/v2/bank_account/${bankAccount.id}/paychecks`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .expect(200);

        expect(body).to.have.lengthOf(0);
      });

      it('should not display paychecks older than a month old', async () => {
        const oneMonthAndADayAgo = moment()
          .subtract(1, 'month')
          .subtract(1, 'day');

        bankTransaction.transactionDate = oneMonthAndADayAgo.format('YYYY-MM-DD');
        upsertBankTransactionForStubs(bankTransaction);

        expect(bankConnectionTransition.hasReceivedRecurringPaycheck).to.equal(false);

        const { body } = await request(app)
          .get(`/v2/bank_account/${bankAccount.id}/paychecks`)
          .set('Authorization', bankAccount.userId.toString())
          .set('X-Device-Id', bankAccount.userId.toString())
          .expect(200);

        expect(body).to.have.lengthOf(0);
      });
    });

    it('Will error if bank account is not found', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [moment().subtract(7, 'days'), moment(), moment().subtract(14, 'days')];
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: 100,
          pending: false,
        });
      });
      await request(app)
        .get(`/v2/bank_account/bacon/paychecks`)
        .set('Authorization', bankAccount.userId)
        .set('X-Device-Id', bankAccount.userId)
        .expect(404);
    });
  });

  describe('Detect expenses', () => {
    it('should detect all paycheck schedules', async () => {
      const bankAccount = await factory.create('checking-account');
      sandbox.useFakeTimers(new Date(2019, 9, 27).getTime());
      const displayName = 'DISPLAY NAME';
      const currentDate = '2019-10-25';
      const dates = [
        moment(currentDate).subtract(7, 'days'),
        moment(currentDate),
        moment(currentDate).subtract(14, 'days'),
      ].map(d => nextBankingDay(d, -1));
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: -100,
          pending: false,
        });
      });
      const result = await request(app)
        .get(`/v2/bank_account/${bankAccount.id}/predicted_expenses`)
        .set('Authorization', bankAccount.userId)
        .set('X-Device-Id', bankAccount.userId);
      const [transaction] = result.body;
      expect(transaction.interval).to.equal(RecurringTransactionInterval.WEEKLY);
      expect(transaction.params[0]).to.equal(
        moment(currentDate)
          .format('dddd')
          .toLowerCase(),
      );
      expect(transaction.rollDirection).to.equal(-1);
      expect(transaction.displayName).to.equal(displayName);
      expect(transaction.bankTransactionId).to.not.be.undefined;
      expect(moment(transaction.nextOccurrence).isSameOrAfter(moment(currentDate), 'day')).to.equal(
        true,
      );
      expect(transaction.observations).to.have.lengthOf(dates.length);
      const observationDates = dates.map(date => date.format('YYYY-MM-DD'));
      for (const observation of transaction.observations) {
        expect(observation.amount).to.equal(-100);
        expect(observation.displayName.toLowerCase()).to.equal(displayName.toLowerCase());
        const dateIndex = observationDates.indexOf(observation.transactionDate);
        expect(dateIndex).to.not.equal(-1);
        observationDates.splice(dateIndex, 1);
      }
      expect(observationDates).to.have.lengthOf(0);
    });

    it('Will error if bank account is not found', async () => {
      const bankAccount = await factory.create('checking-account');
      const displayName = 'DISPLAY NAME';
      const dates = [
        moment().subtract(7, 'days'),
        moment(),
        moment().subtract(14, 'days'),
        moment().subtract(21, 'days'),
      ];
      await Bluebird.map(dates, date => {
        return factory.create('bank-transaction', {
          bankAccountId: bankAccount.id,
          userId: bankAccount.id,
          transactionDate: date,
          displayName,
          externalId: date.format('YYYY-MM-DD'),
          externalName: displayName,
          amount: -100,
          pending: false,
        });
      });
      await request(app)
        .get(`/v2/bank_account/bacon/predicted_expenses`)
        .set('Authorization', bankAccount.userId)
        .set('X-Device-Id', bankAccount.userId)
        .expect(404);
    });
  });
});

function isWeekend(m: Moment): boolean {
  return m.day() === 0 || m.day() === 6;
}
