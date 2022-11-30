import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
} from '@dave-inc/loomis-client';
import { BankingDataSource, ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import BankOfDaveInternalApiIntegration from '../../../src/domain/banking-data-source/bank-of-dave-internal/integration';
import * as Limiter from '../../../src/domain/banking-data-source/plaid/limiter';
import * as ACH from '../../../src/domain/collection/ach';
import Task from '../../../src/domain/collection/refresh-balance-and-collect';
import BankOfDaveInternalApiGateway from '../../../src/domain/payment-provider/bank-of-dave-internal-api/gateway';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import UserHelper from '../../../src/helper/user';
import * as Jobs from '../../../src/jobs/data';
import { performACHCollection } from '../../../src/jobs/handlers';
import {
  BankDataSourceRefreshError,
  CUSTOM_ERROR_CODES,
  PaymentProcessorError,
} from '../../../src/lib/error';
import Plaid from '../../../src/lib/plaid';
import * as Tabapay from '../../../src/lib/tabapay';
import {
  Advance,
  AuditLog,
  BalanceCheck,
  BankAccount,
  BankConnection,
  Payment,
} from '../../../src/models';
import BankingDataClient from '../../../src/lib/heath-client';
import factory from '../../factories';
import { clean, setUpRefreshBalanceAndCollectData, stubLoomisClient } from '../../test-helpers';

describe('RefreshBalanceAndCollect', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubLoomisClient(sandbox);
  });
  afterEach(() => clean(sandbox));

  context('Plaid Bank Connection', () => {
    let getAllPrimaryPaymentSourcesStub: sinon.SinonStub;

    beforeEach(() => {
      getAllPrimaryPaymentSourcesStub = sandbox.stub(UserHelper, 'getAllPrimaryPaymentSources');
    });

    describe('getAllPaymentSources', () => {
      it('should return advance bank account/payment method, and all other primary payment methods', async () => {
        const primaryBankAccountDebitCardA = await factory.create('payment-method');
        const primaryBankAccountA = await primaryBankAccountDebitCardA.getBankAccount();
        await primaryBankAccountA.update({
          defaultPaymentMethodId: primaryBankAccountDebitCardA.id,
        });

        const primaryBankAccountDebitCardB = await factory.create('payment-method');
        const primaryBankAccountB = await primaryBankAccountDebitCardB.getBankAccount();
        await primaryBankAccountB.update({
          defaultPaymentMethodId: primaryBankAccountDebitCardB.id,
        });

        const advancePaymentMethod = await factory.create('payment-method');
        const advanceBankAccount = await advancePaymentMethod.getBankAccount();
        const advance = await factory.create('advance', {
          bankAccountId: advanceBankAccount.id,
          paymentMethodId: advancePaymentMethod.id,
        });

        getAllPrimaryPaymentSourcesStub.withArgs(advance.userId, { paranoid: false }).returns([
          { bankAccount: primaryBankAccountA, debitCard: primaryBankAccountDebitCardA },
          { bankAccount: primaryBankAccountB, debitCard: primaryBankAccountDebitCardB },
        ]);

        const task = new Task(advance);
        const paymentOptions = await task.getAllPaymentSources();

        expect(paymentOptions).length(3);
        expect(paymentOptions[0].bankAccount.id).to.equal(advance.bankAccountId);
        expect(paymentOptions[0].debitCard.id).to.equal(advance.paymentMethodId);
        expect(paymentOptions[1].bankAccount.id).to.equal(primaryBankAccountA.id);
        expect(paymentOptions[1].debitCard.id).to.equal(primaryBankAccountDebitCardA.id);
        expect(paymentOptions[2].bankAccount.id).to.equal(primaryBankAccountB.id);
        expect(paymentOptions[2].debitCard.id).to.equal(primaryBankAccountDebitCardB.id);
      });
      it('loads deleted bank accounts', async () => {
        const bankAccount = await factory.create('checking-account');
        const advance = await factory.create('advance', { bankAccountId: bankAccount.id });

        getAllPrimaryPaymentSourcesStub.withArgs(advance.userId, { paranoid: false }).returns([
          {
            bankAccount,
            debitCard: null,
          },
        ]);

        await bankAccount.destroy();

        const task = new Task(advance);

        const paymentOptions = await task.getAllPaymentSources();

        expect(paymentOptions).length(1);
        expect(paymentOptions[0].bankAccount.id).to.equal(bankAccount.id);
        expect(paymentOptions[0].debitCard).to.equal(null);
      });
    });

    describe('getBalances', () => {
      it('saves the advance id on plaid balance refresh', async () => {
        const bankAccount = await factory.create('checking-account');
        const advance = await factory.create('advance', { bankAccountId: bankAccount.id });

        sandbox.stub(Plaid, 'getBalance').resolves({
          accounts: [
            {
              account_id: bankAccount.externalId,
              type: 'depository',
              subtype: 'checking',
              balances: {
                available: 87,
                current: 100,
                limit: null,
              },
            },
          ],
        });

        const task = new Task(advance);

        await task.getBalances(bankAccount);

        const log = await BalanceCheck.findOne({
          where: {
            bankConnectionId: bankAccount.bankConnectionId,
          },
        });

        expect(log.advanceId).to.equal(advance.id);
      });
    });
  });

  context('Bank of Dave Bank Connection', () => {
    it('loads deleted bank accounts', async () => {
      const bankAccount = await factory.create('checking-account', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const advance = await factory.create('advance', { bankAccountId: bankAccount.id });

      await bankAccount.destroy();

      sandbox
        .stub(UserHelper, 'getAllPrimaryPaymentSources')
        .withArgs(advance.userId)
        .returns([{ bankAccount, debitCard: null }]);

      const task = new Task(advance);

      const paymentOptions = await task.getAllPaymentSources();

      expect(paymentOptions).length(1);
      expect(paymentOptions[0].bankAccount.id).to.equal(advance.bankAccountId);
      expect(paymentOptions[0].debitCard).to.equal(null);
    });

    it('saves the advance id on advance creation', async () => {
      const token = '1783460';
      const externalId = '0b39346b-9b00-4aee-a11e-0428fd13df81';
      const user = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', {
        authToken: token,
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bankAccount = await factory.create('checking-account', {
        userId: user.id,
        externalId,
        bankConnectionId: bankConnection.id,
      });

      sandbox.stub(BankOfDaveInternalApiIntegration.prototype, 'getBalance').resolves([
        {
          externalId,
          bankingDataSource: BankingDataSource.BankOfDave,
          available: 12,
          current: 12,
        },
      ]);

      const advance = await factory.create('advance', { bankAccountId: bankAccount.id });

      const task = new Task(advance);

      await task.getBalances(bankAccount);

      const log = await BalanceCheck.findOne({
        where: {
          bankConnectionId: bankAccount.bankConnectionId,
        },
      });

      expect(log.advanceId).to.equal(advance.id);
    });
  });

  describe('More Tests', () => {
    before(() => clean());
    afterEach(() => clean(sandbox));

    describe('#run', () => {
      context('Plaid', () => {
        testFunctionality(BankingDataSource.Plaid);

        it('returns the correct error on plaid balance rate limit', async () => {
          const advance = await setUpRefreshBalanceAndCollectData({
            bankingDataSource: BankingDataSource.Plaid,
          });

          sandbox.stub(Limiter, 'checkRateLimitAndWait').resolves(true);

          const task = new Task(advance);

          const result = await task.run();

          expect(result.error).to.be.instanceOf(BankDataSourceRefreshError);
          expect(result.error).to.include({
            customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
            source: BankingDataSource.Plaid,
          });
        });
      });

      context('Bank Of Dave', () => {
        testFunctionality(BankingDataSource.BankOfDave);
      });

      context('Fall Back to Plaid Account', () => {
        let advance: Advance;
        let oldBankAccount: BankAccount;

        beforeEach(async () => {
          advance = await setUpRefreshBalanceAndCollectData({
            bankingDataSource: BankingDataSource.BankOfDave,
          });

          const oldBankConnection = await factory.create('bank-connection', {
            userId: advance.userId,
            bankingDataSource: BankingDataSource.Plaid,
          });
          oldBankAccount = await factory.create('checking-account', {
            userId: advance.userId,
            bankConnectionId: oldBankConnection.id,
          });

          await oldBankConnection.update({ primaryBankAccountId: oldBankAccount.id });
        });

        it('falls back to plaid account if balance is too low', async () => {
          const synapseStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
            status: 'COMPLETED',
            id: 'foo-bar',
          });

          const task = new Task(advance);

          sandbox
            .stub(task, 'getBalances')
            .onFirstCall()
            .resolves({ available: 0, current: 0 })
            .onSecondCall()
            .resolves({ available: 100, current: 100 });
          sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

          await task.run();

          const [updatedAdvance, [payment]] = await Bluebird.all([
            Advance.findByPk(advance.id),
            Payment.findAll({ where: { advanceId: advance.id } }),
          ]);

          expect(synapseStub.callCount).to.eq(1);

          expect(updatedAdvance.outstanding).to.equal(0);
          expect(payment.amount).to.equal(80);
          expect(payment.bankAccountId).to.equal(oldBankAccount.id);
        });

        it('falls back to old default payment method if account is too low', async () => {
          const { id: paymentMethodId } = await factory.create('payment-method', {
            userId: oldBankAccount.userId,
            bankAccountId: oldBankAccount.id,
          });
          await oldBankAccount.update({ defaultPaymentMethodId: paymentMethodId });

          const task = new Task(advance);

          const tabapayStub = sandbox.stub(Tabapay, 'retrieve').resolves({
            status: 'COMPLETED',
            id: 'foo-bar',
          });
          sandbox
            .stub(task, 'getBalances')
            .onFirstCall()
            .resolves({ available: 0, current: 0 })
            .onSecondCall()
            .resolves({ available: 100, current: 100 });

          await task.run();

          expect(tabapayStub.callCount).to.eq(1);

          const [updatedAdvance, [payment]] = await Bluebird.all([
            Advance.findByPk(advance.id),
            Payment.findAll({ where: { advanceId: advance.id } }),
          ]);

          expect(updatedAdvance.outstanding).to.equal(0);
          expect(payment.amount).to.equal(80);
          expect(payment.paymentMethodId).to.equal(paymentMethodId);
        });

        it('fails to collect if cannot collect from old account', async () => {
          const synapseStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
            status: 'COMPLETED',
            id: 'foo-bar',
          });

          const task = new Task(advance);

          sandbox
            .stub(task, 'getBalances')
            .onFirstCall()
            .resolves({ available: 0, current: 0 });

          await task.run();

          const [updatedAdvance, [payment]] = await Bluebird.all([
            Advance.findByPk(advance.id),
            Payment.findAll({ where: { advanceId: advance.id } }),
          ]);

          expect(synapseStub.callCount).to.eq(0);
          expect(updatedAdvance.outstanding).to.equal(80);
          expect(payment).to.equal(undefined);
        });
      });
    });
  });

  async function stubPlaid(
    bankAccount: BankAccount,
    balance: number = 200,
    { stub }: { stub?: sinon.SinonStub } = {},
  ) {
    const bankConnection = await bankAccount.getBankConnection();

    (stub || sandbox.stub(Plaid, 'getBalance'))
      .withArgs(bankConnection.authToken, { account_ids: [bankAccount.externalId] })
      .resolves({
        accounts: [
          {
            account_id: bankAccount.externalId,
            subtype: 'checking',
            type: 'depository',
            balances: {
              available: balance,
              current: balance,
              limit: null,
            },
          },
        ],
      });
  }

  async function stubBankOfDave(bankAccount: BankAccount, balance: number = 200) {
    sandbox.stub(BankOfDaveInternalApiIntegration.prototype, 'getBalance').resolves([
      {
        bankingDataSource: BankingDataSource.BankOfDave,
        externalId: bankAccount.externalId,
        available: balance,
        current: balance,
      },
    ]);
  }

  function testFunctionality(bankingDataSource: BankingDataSource) {
    it('collects outstanding amount when available', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);
      const debitCard = await bankAccount.getDefaultPaymentMethod();

      const tabapayStub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 200);
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 200);
      }

      const task = new Task(advance);
      await task.run();

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(tabapayStub.callCount).to.eq(1);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
      expect(payment.paymentMethodId).to.equal(debitCard.id);
    });

    it('publishes a balance to the balance log client', async () => {
      const balanceStub = sandbox.stub(BankingDataClient, 'saveBalanceLogs').resolves();

      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);
      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 200);
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 200);
      }

      const task = new Task(advance);
      await task.run();

      expect(balanceStub.callCount).to.eq(1);
      expect(balanceStub.firstCall.args[0].available).to.eq(200);
    });

    it('falls back to ACH collection', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox
        .stub(Tabapay, 'retrieve')
        .rejects(new PaymentProcessorError('Unspecified error', 'Something'));
      sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(true);

      let expectedProcessor;
      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 200);
        sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
          status: 'PENDING',
          id: 'foo-bar',
        });

        expectedProcessor = ExternalTransactionProcessor.Synapsepay;
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 200);
        const transaction: PaymentProviderTransaction = {
          externalId: 'foo',
          referenceId: 'bar',
          status: PaymentProviderTransactionStatus.Completed,
          gateway: PaymentGateway.BankOfDave,
          processor: PaymentProcessor.BankOfDave,
          reversalStatus: null,
        };
        sandbox.stub(BankOfDaveInternalApiGateway, 'createTransaction').resolves(transaction);
        expectedProcessor = ExternalTransactionProcessor.BankOfDave;
      }

      const task = new Task(advance);
      await task.run();

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.externalProcessor).to.equal(expectedProcessor);
    });

    it('falls back to ACH collection and schedules job outside of ACH window', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox
        .stub(Tabapay, 'retrieve')
        .rejects(new PaymentProcessorError('Unspecified error', 'Something'));
      const achStub = sandbox.stub(ACH, 'isInSameDayACHCollectionWindow').returns(false);
      const taskStub = sandbox.stub(Jobs, 'createACHCollectionTask');

      let expectedProcessor;
      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 200);
        sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
          status: 'PENDING',
          id: 'foo-bar',
        });

        expectedProcessor = ExternalTransactionProcessor.Synapsepay;
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 200);
        const transaction: PaymentProviderTransaction = {
          externalId: 'foo',
          referenceId: 'bar',
          status: PaymentProviderTransactionStatus.Completed,
          gateway: PaymentGateway.BankOfDave,
          processor: PaymentProcessor.BankOfDave,
          reversalStatus: null,
        };

        sandbox.stub(BankOfDaveInternalApiGateway, 'createTransaction').resolves(transaction);
        expectedProcessor = ExternalTransactionProcessor.BankOfDave;
      }

      const task = new Task(advance);
      await task.run();

      if (bankingDataSource === BankingDataSource.Plaid) {
        expect(taskStub.callCount).to.equal(1);

        achStub.returns(true);
        await performACHCollection({ advanceIds: [advance.id] });
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        expect(taskStub.callCount).to.equal(0);
      }

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(updatedAdvance.outstanding).to.equal(0);
      expect(payment.amount).to.equal(outstanding);
      expect(payment.bankAccountId).to.equal(bankAccount.id);
      expect(payment.externalProcessor).to.equal(expectedProcessor);
    });

    it('collects partial amounts', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const outstanding = advance.outstanding;

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 70);
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 70);
      }
      const task = new Task(advance);
      await task.run();

      const [updatedAdvance, [payment]] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id } }),
      ]);

      expect(payment.amount).to.equal(65);
      expect(updatedAdvance.outstanding).to.equal(outstanding - 65);
    });

    it('collects partial amounts and continues to collect for every primary bank account', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });
      const plaidGetBalanceStub = sandbox.stub(Plaid, 'getBalance');

      // Setup another plaid connection with $45 balance
      const otherPrimaryBankAccountA = await factory.create('checking-account', {
        userId: advance.userId,
        bankingDataSource: BankingDataSource.Plaid,
      });
      const otherPrimaryBankAccountDebitCardA = await factory.create('payment-method', {
        userId: advance.userId,
        bankAccountId: otherPrimaryBankAccountA.id,
      });
      await otherPrimaryBankAccountA.update({
        userId: advance.userId,
        defaultPaymentMethodId: otherPrimaryBankAccountDebitCardA.id,
      });
      await stubPlaid(otherPrimaryBankAccountA, 35, { stub: plaidGetBalanceStub });
      await BankConnection.update(
        { userId: advance.userId, primaryBankAccountId: otherPrimaryBankAccountA.id },
        { where: { id: otherPrimaryBankAccountA.bankConnectionId } },
      );

      // Setup another plaid connection with $50 balance
      const otherPrimaryBankAccountB = await factory.create('checking-account', {
        userId: advance.userId,
        bankingDataSource: BankingDataSource.Plaid,
      });
      const otherPrimaryBankAccountDebitCardB = await factory.create('payment-method', {
        userId: advance.userId,
        bankAccountId: otherPrimaryBankAccountB.id,
      });
      await otherPrimaryBankAccountB.update({
        userId: advance.userId,
        defaultPaymentMethodId: otherPrimaryBankAccountDebitCardB.id,
      });
      await stubPlaid(otherPrimaryBankAccountB, 35, { stub: plaidGetBalanceStub });
      await BankConnection.update(
        { userId: advance.userId, primaryBankAccountId: otherPrimaryBankAccountB.id },
        { where: { id: otherPrimaryBankAccountB.bankConnectionId } },
      );

      const outstanding = advance.outstanding;

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox
        .stub(Tabapay, 'retrieve')
        .onFirstCall()
        .resolves({
          status: 'COMPLETED',
          id: 'foo-bar-1',
        })
        .onSecondCall()
        .resolves({
          status: 'COMPLETED',
          id: 'foo-bar-2',
        })
        .onThirdCall()
        .resolves({
          status: 'COMPLETED',
          id: 'foo-bar-4',
        });

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 30, { stub: plaidGetBalanceStub });
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 30);
      }

      const task = new Task(advance);
      await task.run();

      const [updatedAdvance, payments] = await Bluebird.all([
        Advance.findByPk(advance.id),
        Payment.findAll({ where: { advanceId: advance.id, status: 'COMPLETED' } }),
      ]);

      const paymentTotal = payments.reduce((total, payment) => total + payment.amount, 0);
      expect(paymentTotal).to.equal(85);
      expect(updatedAdvance.outstanding).to.equal(outstanding - 85);
    });

    it('logs failures', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox.stub(Tabapay, 'retrieve').rejects();
      sandbox.stub(SynapsepayNodeLib, 'charge').rejects();

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 70);
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 70);
      }

      const task = new Task(advance);
      await task.run();

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === task.logName;
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });

    it('logs success', async () => {
      const advance = await setUpRefreshBalanceAndCollectData({
        bankingDataSource,
        paybackDate: moment(),
        amount: 75,
        fee: 5,
        tipPercent: 10,
      });

      const bankAccount = await BankAccount.findByPk(advance.bankAccountId);

      sandbox.stub(Tabapay, 'retrieve').resolves({
        status: 'COMPLETED',
        id: 'foo-bar',
      });

      if (bankingDataSource === BankingDataSource.Plaid) {
        await stubPlaid(bankAccount, 200);
      } else if (bankingDataSource === BankingDataSource.BankOfDave) {
        await stubBankOfDave(bankAccount, 200);
      }
      const task = new Task(advance);

      await task.run();

      const [log] = (await AuditLog.findAll({ where: { userId: advance.userId } })).filter(l => {
        return l.type === 'DAILY_AUTO_RETRIEVE_JOB';
      });

      expect(log.successful).to.equal(true);
      expect(log.eventUuid).to.equal(`${advance.id}`);
    });
  }
});
