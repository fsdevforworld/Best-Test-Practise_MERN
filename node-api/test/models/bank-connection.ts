import { expect } from 'chai';
import { Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import factory from '../factories';
import { clean } from '../test-helpers';
import BankAccount from '../../src/models/bank-account';
import { BankingDataSource, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { BankConnection, User } from '../../src/models';
import { generateBankingDataSource } from '../../src/domain/banking-data-source';

describe('BankConnection', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('softDelete', () => {
    it('sets the deleted field', async () => {
      const bankConnection = await factory.create('bank-connection');
      await bankConnection.softDelete();
      await bankConnection.reload({ paranoid: false });
      expect(bankConnection.deleted).to.be.sameMoment(moment(), 'day');
    });

    it('removes the banking details from the associated bank account', async () => {
      const bankAccount = await factory.create('bank-account');
      const bankConnection = await bankAccount.getBankConnection();
      await bankConnection.softDelete();
      await bankAccount.reload({ paranoid: false });
      expect(bankAccount.deleted).to.be.sameMoment(moment(), 'day');
      expect(bankAccount.synapseNodeId).to.eq(null);
      expect(bankAccount.accountNumber).to.eq(null);
    });

    it('sets the deleted field on the payment method', async () => {
      const paymentMethod = await factory.create('payment-method');
      const bankAccount = await paymentMethod.getBankAccount();
      const bankConnection = await bankAccount.getBankConnection();
      await bankConnection.softDelete();
      await paymentMethod.reload({ paranoid: false });
      expect(paymentMethod.deleted).to.be.sameMoment(moment(), 'day');
    });

    it('deletes connection and associated bank account, prefixing external ID and auth token with deleted', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      const { externalId: bankAccountExternalId } = bankAccount;
      const {
        externalId: bankConnectionExternalId,
        authToken: bankConnectionAuthToken,
      } = bankConnection;

      await bankConnection.softDelete();
      await Promise.all([
        bankConnection.reload({ paranoid: false }),
        bankAccount.reload({ paranoid: false }),
      ]);

      expect(bankConnection.deleted).to.exist;
      expect(bankConnection.authToken).to.eq(
        `deleted-${bankConnection.id}-${bankConnectionAuthToken}`,
      );
      expect(bankConnection.externalId).to.eq(
        `deleted-${bankConnection.id}-${bankConnectionExternalId}`,
      );
      expect(bankAccount.externalId).to.eq(`deleted-${bankAccount.id}-${bankAccountExternalId}`);
    });

    it('will not prepend delted multiple times to external id and auth token', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      const {
        externalId: bankConnectionExternalId,
        authToken: bankConnectionAuthToken,
      } = bankConnection;

      await bankConnection.softDelete();
      await bankConnection.reload({ paranoid: false });
      await bankConnection.softDelete();

      expect(bankConnection.deleted).to.exist;
      expect(bankConnection.authToken).to.eq(
        `deleted-${bankConnection.id}-${bankConnectionAuthToken}`,
      );
      expect(bankConnection.externalId).to.eq(
        `deleted-${bankConnection.id}-${bankConnectionExternalId}`,
      );
    });
  });

  describe('generateBankingDataSource', () => {
    it('should return an instance of the Plaid data source', async () => {
      const bankConnection = await factory.create<BankConnection>('bank-connection', {
        bankingDataSource: BankingDataSource.Plaid,
      });
      const bankingDataSource = await generateBankingDataSource(bankConnection);

      expect(bankingDataSource.constructor.name).to.eq('PlaidIntegration');
      expect(bankingDataSource).to.include({
        token: bankConnection.authToken,
      });
    });

    it('should return an instance of the Bank Of Dave data source', async () => {
      const bankConnection = await factory.create<BankConnection>('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      const bankingDataSource = await generateBankingDataSource(bankConnection);

      expect(bankingDataSource.constructor.name).to.be.oneOf([
        'BankOfDaveIntegration',
        'BankOfDaveInternalApiIntegration',
      ]);
      expect(bankingDataSource).to.include({
        userUuid: bankConnection.authToken,
      });
    });

    it('should return an instance of the Mx data source', async () => {
      const user = await factory.create<User>('user', {
        mxUserId: 'USR-fake-mx-user-guid',
      });
      const bankConnection = await factory.create<BankConnection>('bank-connection', {
        bankingDataSource: BankingDataSource.Mx,
        userId: user.id,
      });
      const bankingDataSource = await generateBankingDataSource(bankConnection);

      expect(bankingDataSource.constructor.name).to.eq('MxIntegration');
      expect(bankingDataSource).to.include({
        userGuid: user.mxUserId,
        memberGuid: bankConnection.externalId,
      });
    });
  });

  describe('hasPayments', () => {
    it('should determine if there are associated payments that match the provided query filters', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      expect(await bankConnection.hasPayments()).to.be.false;

      await Promise.all([
        factory.create('payment', {
          bankAccountId: bankAccount.id,
          status: ExternalTransactionStatus.Pending,
        }),
        factory.create('payment', {
          bankAccountId: bankAccount.id,
          status: ExternalTransactionStatus.Canceled,
        }),
      ]);

      const [
        hasPayments,
        hasPendingPayments,
        hasCanceledPayments,
        hasCompletedPayments,
      ] = await Promise.all([
        bankConnection.hasPayments(),
        bankConnection.hasPayments({ status: ExternalTransactionStatus.Pending }),
        bankConnection.hasPayments({ status: ExternalTransactionStatus.Canceled }),
        bankConnection.hasPayments({ status: ExternalTransactionStatus.Completed }),
      ]);

      expect(hasPayments).to.be.true;
      expect(hasPendingPayments).to.be.true;
      expect(hasCanceledPayments).to.be.true;
      expect(hasCompletedPayments).to.be.false;
    });
  });

  describe('hasAdvances', () => {
    it('should determine if there are associated outstanding advances that match the provided query filters', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      expect(await bankConnection.hasAdvances()).to.be.false;

      await Promise.all([
        factory.create('advance', {
          bankAccountId: bankAccount.id,
          disbursementStatus: ExternalTransactionStatus.Pending,
          outstanding: 25,
        }),
        factory.create('advance', {
          bankAccountId: bankAccount.id,
          disbursementStatus: ExternalTransactionStatus.Completed,
          outstanding: 0,
        }),
      ]);

      const [
        hasAdvances,
        hasPendingAdvances,
        hasCanceledAdvances,
        hasOutstandingAdvances,
      ] = await Promise.all([
        bankConnection.hasAdvances(),
        bankConnection.hasAdvances({ disbursementStatus: ExternalTransactionStatus.Pending }),
        bankConnection.hasAdvances({ disbursementStatus: ExternalTransactionStatus.Canceled }),
        bankConnection.hasAdvances({ outstanding: { [Op.gt]: 0 } }),
      ]);

      expect(hasAdvances).to.be.true;
      expect(hasPendingAdvances).to.be.true;
      expect(hasCanceledAdvances).to.be.false;
      expect(hasOutstandingAdvances).to.be.true;
    });
  });
});
