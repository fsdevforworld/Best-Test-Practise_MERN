import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentProviderTransactionType,
  PaymentProcessor,
  PaymentGateway,
} from '@dave-inc/loomis-client';
import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import * as SynapsepayUserLib from '../../../src/domain/synapsepay/user';
import * as ChargeBankAccount from '../../../src/domain/collection/charge-bank-account';
import gcloudKms from '../../../src/lib/gcloud-kms';
import { AuditLog, BankAccount, Payment, User } from '../../../src/models';
import { UnsupportedPaymentProcessorError } from '../../../src/lib/error';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';

import * as TabapayACHExperiment from '../../../src/experiments/tabapay-ach';

describe('BankAccount', () => {
  const sandbox = sinon.createSandbox({ properties: ['stub', 'fake'] });
  const bodUserId = '2a82e635-d1dd-46c1-bc82-56f722a6e698';
  const bodSourceId = '0b39346b-9b00-4aee-a11e-0428fd13df81';
  let payment: Payment;

  before(() => clean(sandbox));
  beforeEach(async () => {
    await up();
    payment = await factory.create('payment', { referenceId: 'refId' });
  });
  afterEach(() => clean(sandbox));

  describe('.chargeBankAccount', () => {
    it('adds the user and account to the payment processor', async () => {
      const bankAccount: BankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
        synapseNodeId: null,
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper', synapsepayId: null },
        { where: { id: bankAccount.userId } },
      );

      const userStub = sandbox
        .stub(SynapsepayUserLib, 'upsertSynapsePayUser')
        .callsFake(async (user: User, ip: string, fields: any) => {
          await user.update({ synapsepayId: 'foo' });
          return;
        });
      const nodeStub = sandbox.stub(SynapsepayNodeLib, 'createSynapsePayNode').resolves();
      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'COMPLETED',
        id: 'baz',
      });
      const externalPayment = await ChargeBankAccount.chargeBankAccount(bankAccount, 50, payment, {
        transactionType: PaymentProviderTransactionType.AdvancePayment,
      });

      expect(userStub).to.have.callCount(1);
      expect(nodeStub).to.have.callCount(1);
      expect(externalPayment.type).to.equal('ach');
      expect(externalPayment.amount).to.equal(50);
      expect(externalPayment.id).to.equal('baz');
      expect(externalPayment.processor).to.equal('SYNAPSEPAY');
    });

    it('completes an ACH transaction', async () => {
      const bankAccount: BankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper' },
        { where: { id: bankAccount.userId } },
      );

      sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');
      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'COMPLETED',
        id: 'baz',
      });
      const externalPayment = await ChargeBankAccount.chargeBankAccount(bankAccount, 50, payment, {
        transactionType: PaymentProviderTransactionType.AdvancePayment,
      });

      expect(externalPayment.type).to.equal('ach');
      expect(externalPayment.amount).to.equal(50);
      expect(externalPayment.id).to.equal('baz');
      expect(externalPayment.processor).to.equal('SYNAPSEPAY');
    });

    it('completes a subscription ACH transaction', async () => {
      const bankAccount: BankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper' },
        { where: { id: bankAccount.userId } },
      );

      sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');
      const synapseSpy = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'COMPLETED',
        id: 'baz',
      });
      const externalPayment = await ChargeBankAccount.chargeBankAccount(bankAccount, 1, payment, {
        transactionType: PaymentProviderTransactionType.SubscriptionPayment,
      });

      expect(synapseSpy).have.callCount(1);
      expect(synapseSpy.getCall(0).args[4].transactionType).to.equal(
        PaymentProviderTransactionType.SubscriptionPayment,
      );
      expect(externalPayment.type).to.equal('ach');
      expect(externalPayment.amount).to.equal(1);
      expect(externalPayment.id).to.equal('baz');
      expect(externalPayment.processor).to.equal('SYNAPSEPAY');
    });

    it('logs the external payment', async () => {
      const bankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper' },
        { where: { id: bankAccount.userId } },
      );

      sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');
      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'COMPLETED',
        id: 'baz',
      });

      const externalPayment = await ChargeBankAccount.chargeBankAccount(bankAccount, 50, payment, {
        transactionType: PaymentProviderTransactionType.AdvancePayment,
      });

      const [log] = await AuditLog.findAll({
        where: {
          userId: bankAccount.userId,
          type: 'EXTERNAL_PAYMENT',
        },
      });

      expect(log.successful).to.equal(true);
      expect(log.extra.payment.id).to.equal(externalPayment.id);
      expect(log.extra.payment.type).to.equal('ach');
      expect(log.extra.payment.processor).to.equal('SYNAPSEPAY');
    });

    it('logs a failed charge attempt', async () => {
      const bankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper' },
        { where: { id: bankAccount.userId } },
      );

      sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');
      sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'FAILED',
        id: 'baz',
      });

      await expect(
        ChargeBankAccount.chargeBankAccount(bankAccount, 50, payment, {
          transactionType: PaymentProviderTransactionType.AdvancePayment,
        }),
      ).to.be.rejectedWith('Failed to process ach withdrawa');

      const [log] = await AuditLog.findAll({
        where: {
          userId: bankAccount.userId,
          type: 'EXTERNAL_PAYMENT',
        },
      });

      expect(log.successful).to.be.false;
      expect(log.extra.externalResponse.status).to.equal('FAILED');
      expect(log.extra.type).to.equal('ach');
    });

    it('does not allow the transaction if the account holder is suspected of fraud', async () => {
      const bankAccount = await factory.create('bank-account', {
        accountNumberAes256: 'foo-bar',
      });

      await User.update(
        { firstName: 'Don', lastName: 'Draper', fraud: true },
        { where: { id: bankAccount.userId } },
      );

      sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');
      const achSpy = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: 'COMPLETED',
        id: 'baz',
      });
      const testPayment = await factory.create('payment', {
        referenceId: 'foo-id',
        bankAccountId: bankAccount.id,
      });

      await expect(
        ChargeBankAccount.chargeBankAccount(bankAccount, 50, testPayment, {
          transactionType: PaymentProviderTransactionType.AdvancePayment,
        }),
      ).to.be.rejectedWith('Transaction not allowed: user suspected of fraud');

      sinon.assert.notCalled(achSpy);
    });
  });

  describe('retrieve', () => {
    describe(`processor: ${ExternalTransactionProcessor.BankOfDave}`, () => {
      const bankConnectionExternalId = bodUserId;
      const bankAccountExternalId = bodSourceId;

      it('successfully creates a transaction for a subscription payment', async () => {
        const referenceId = 'test-20190417-02';
        const bankConnection = await factory.create('bank-connection', {
          externalId: bankConnectionExternalId,
          bankingDataSource: 'BANK_OF_DAVE',
        });

        const bankAccount = await factory.create('bank-account', {
          bankConnectionId: bankConnection.id,
          userId: bankConnection.userId,
          externalId: bankAccountExternalId,
        });

        const user = await bankAccount.getUser();

        const testPayment = await factory.create('payment', {
          referenceId,
          bankAccountId: bankAccount.id,
          userId: user.id,
        });
        const createTransaction = sandbox.stub().resolves({
          externalId: '4c1e1783-fbd3-4f45-b92f-9be8e349bff7',
          referenceId,
          amount: 20,
          type: PaymentProviderTransactionType.SubscriptionPayment,
          status: ExternalTransactionStatus.Pending,
          processor: PaymentProcessor.BankOfDave,
          gateway: PaymentGateway.BankOfDave,
          reversalStatus: null,
        });
        sandbox.stub(Loomis, 'getPaymentGateway').returns({
          createTransaction,
        });

        const transaction = await ChargeBankAccount.retrieve(
          bankAccount,
          testPayment.referenceId,
          user,
          ExternalTransactionProcessor.BankOfDave,
          20,
          { transactionType: PaymentProviderTransactionType.SubscriptionPayment },
        );

        expect(transaction.id).to.not.equal(null);
        expect(transaction.id).to.not.equal(undefined);
        expect(transaction.status).to.equal(ExternalTransactionStatus.Pending);
        expect(createTransaction.callCount).to.equal(1);
        expect(createTransaction).to.have.been.calledWith({
          amount: 20,
          correspondingId: undefined,
          ownerId: bodUserId,
          referenceId,
          sourceId: bodSourceId,
          type: PaymentProviderTransactionType.SubscriptionPayment,
        });

        it('successfully creates a transaction for an advance payment', async () => {
          const log = await AuditLog.findOne({
            where: {
              userId: bankConnection.userId,
              type: 'EXTERNAL_PAYMENT',
            },
          });
          expect(log).not.to.be.null;
        });
      });

      describe('createSubscriptionCharge', () => {
        it('does not collect from a Bank of Dave account', async () => {
          const referenceId = 'test-20190417-03';
          const bankConnection = await factory.create('bank-connection', {
            externalId: bankConnectionExternalId,
            bankingDataSource: 'BANK_OF_DAVE',
          });

          const bankAccount = await factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
            externalId: bankAccountExternalId,
          });

          const user = await bankAccount.getUser();

          const testPayment = await factory.create('payment', {
            referenceId,
            bankAccountId: bankAccount.id,
            userId: user.id,
          });
          const createTransaction = sandbox.stub().resolves({
            externalId: '2dee78aa-57a0-4ea5-b10b-f002029ac2cf',
            referenceId,
            amount: 20,
            type: PaymentProviderTransactionType.AdvancePayment,
            status: ExternalTransactionStatus.Completed,
            processor: PaymentProcessor.BankOfDave,
            gateway: PaymentGateway.BankOfDave,
            reversalStatus: null,
          });
          sandbox.stub(Loomis, 'getPaymentGateway').returns({
            createTransaction,
          });

          let transaction;
          let error;

          try {
            const charge = await ChargeBankAccount.createBankAccountSubscriptionCharge(bankAccount);
            transaction = await charge(2, testPayment);
          } catch (ex) {
            error = ex;
          } finally {
            expect(transaction).to.equal(undefined);
            expect(error).to.not.equal(undefined);

            expect(error.message).to.equal('Bank account ineligible for collection');
            expect(error.data.failures).to.deep.equal([
              'Cannot charge a dave banking account for subscriptions',
            ]);
          }
          expect(createTransaction.callCount).to.equal(0);
        });
      });

      describe('createAdvanceCharge', () => {
        it('successfully creates a transaction with Bank of Dave', async () => {
          const referenceId = 'test-20190417-01';
          const externalId = '8e490978-525b-4760-bf59-ba28a28b3545';
          const bankConnection = await factory.create('bank-connection', {
            externalId: bodUserId,
            bankingDataSource: 'BANK_OF_DAVE',
          });

          const bankAccount = await factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
            externalId: bodSourceId,
          });

          const advance = await factory.create('advance', {
            bankAccountId: bankAccount.id,
            userId: bankAccount.userId,
            externalId,
            amount: 25,
            outstanding: 25,
          });

          const testPayment = await factory.create('payment', {
            referenceId,
            bankAccountId: bankAccount.id,
            userId: advance.userId,
          });
          const createTransaction = sandbox.stub().resolves({
            externalId: 'accad92b-07fd-4a3d-b566-14140863b702',
            referenceId,
            amount: 5,
            type: PaymentProviderTransactionType.AdvancePayment,
            status: ExternalTransactionStatus.Pending,
            processor: PaymentProcessor.BankOfDave,
            gateway: PaymentGateway.BankOfDave,
            reversalStatus: null,
          });
          sandbox.stub(Loomis, 'getPaymentGateway').returns({
            createTransaction,
          });

          const bankCharge = ChargeBankAccount.createBankAccountAdvanceCharge(bankAccount, advance);
          const transaction = await bankCharge(5, testPayment);

          expect(transaction.id).to.not.equal(null);
          expect(transaction.id).to.not.equal(undefined);
          expect(transaction).to.include({
            status: ExternalTransactionStatus.Pending,
            amount: 5,
            processor: ExternalTransactionProcessor.BankOfDave,
          });

          const log = await AuditLog.findOne({
            where: {
              userId: bankConnection.userId,
              type: 'EXTERNAL_PAYMENT',
            },
          });
          expect(log).not.to.be.null;
          expect(createTransaction.callCount).to.equal(1);
          expect(createTransaction).to.have.been.calledWith({
            amount: 5,
            correspondingId: externalId,
            ownerId: bodUserId,
            referenceId,
            sourceId: bodSourceId,
            type: PaymentProviderTransactionType.AdvancePayment,
          });
        });
      });
    });

    describe(`processor: ${ExternalTransactionProcessor.Risepay}`, () => {
      describe('chargeBankAccount.retrieve', () => {
        it('should throw an UnsupportedPaymentProcessorError when processor is risepay', async () => {
          const referenceId = 'test-20210414-00';
          const bankConnection = await factory.create('bank-connection');

          const bankAccount = await factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: bankConnection.userId,
          });

          const user = await bankAccount.getUser();

          const testPayment = await factory.create('payment', {
            referenceId,
            bankAccountId: bankAccount.id,
            userId: user.id,
          });

          await expect(
            ChargeBankAccount.retrieve(
              bankAccount,
              testPayment.referenceId,
              user,
              ExternalTransactionProcessor.Risepay,
              100,
              { transactionType: PaymentProviderTransactionType.SubscriptionPayment },
            ),
          ).to.be.rejectedWith(UnsupportedPaymentProcessorError, 'Risepay is no longer supported');
        });
      });
    });

    describe.skip(`processor: ${ExternalTransactionProcessor.TabapayACH}`, () => {
      describe('chargeBankAccount', () => {
        it('successfully creates a transaction with Tabapay ACH', async () => {
          const referenceId = 'test-20190417-01';
          const externalId = '8e490978-525b-4760-bf59-ba28a28b3545';
          const user = await factory.create('user');
          const bankConnection = await factory.create('bank-connection', {
            externalId,
            bankingDataSource: BankingDataSource.Plaid,
          });

          const bankAccount = await factory.create('bank-account', {
            bankConnectionId: bankConnection.id,
            userId: user.id,
          });

          const testPayment = await factory.create('payment', {
            referenceId,
            bankAccountId: bankAccount.id,
            userId: user.id,
          });

          const createTransaction = sandbox.stub().resolves({
            externalId: 'accad92b-07fd-4a3d-b566-14140863b702',
            referenceId,
            amount: 25,
            type: PaymentProviderTransactionType.AdvancePayment,
            status: ExternalTransactionStatus.Pending,
            processor: PaymentProcessor.TabapayACH,
            gateway: PaymentGateway.TabapayACH,
            reversalStatus: null,
          });
          const getPaymentGatewayStub = sandbox.stub(Loomis, 'getPaymentGateway').returns({
            createTransaction,
          });
          sandbox.stub(TabapayACHExperiment, 'useTabapayRepaymentsACH').returns(true);

          const transaction = await ChargeBankAccount.chargeBankAccount(
            bankAccount,
            25,
            testPayment,
            {
              transactionType: PaymentProviderTransactionType.AdvancePayment,
            },
          );

          expect(transaction.id).to.not.equal(null);
          expect(transaction.id).to.not.equal(undefined);
          expect(transaction).to.include({
            status: ExternalTransactionStatus.Pending,
            amount: 25,
            processor: ExternalTransactionProcessor.TabapayACH,
          });

          expect(createTransaction.callCount).to.equal(1);
          expect(getPaymentGatewayStub).to.have.been.calledWith(PaymentGateway.TabapayACH);
          expect(createTransaction).to.have.been.calledWith({
            amount: 25,
            correspondingId: undefined,
            ownerId: bankConnection.externalId,
            referenceId,
            sourceId: bankAccount.id.toString(),
            type: PaymentProviderTransactionType.AdvancePayment,
          });
        });
      });
    });
  });
});
