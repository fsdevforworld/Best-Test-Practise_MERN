import {
  AdvanceDelivery,
  BankAccountSubtype,
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';
import { clean } from '../test-helpers';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import logger from '../../src/lib/logger';
import { moment } from '@dave-inc/time-lib';
import { Advance, AdvanceTip, BankAccount, PaymentMethod, User } from '../../src/models';

describe('Advance', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('isPaid', () => {
    it('returns true if outstanding amount is 0', async () => {
      const advance = await factory.create('advance', { outstanding: 0 });
      expect(advance.isPaid()).to.eq(true);
    });

    it('returns false if outstanding amount is greater than 0', async () => {
      const advance = await factory.create('advance');
      expect(advance.isPaid()).to.eq(false);
    });
  });

  describe('modifications', () => {
    it('records modifications', async () => {
      const advance = await factory.create('advance', {
        disbursementStatus: ExternalTransactionStatus.Pending,
      });

      await advance.update({ disbursementStatus: ExternalTransactionStatus.Completed });

      await advance.reload();

      expect(advance.modifications[0].current.disbursementStatus).to.equal(
        ExternalTransactionStatus.Completed,
      );
      expect(advance.modifications[0].previous.disbursementStatus).to.equal(
        ExternalTransactionStatus.Pending,
      );
    });

    it('only records fields that actually change their value', async () => {
      const advance = await factory.create('advance', {
        amount: 20,
        fee: 1,
      });

      await advance.update({ amount: 20, fee: 0 });

      await advance.reload();

      expect(advance.modifications[0].current.amount).to.equal(undefined);
    });

    it('includes metadata', async () => {
      const advance = await factory.create('advance', {
        fee: 1,
      });

      await advance.update({ fee: 0 }, { metadata: { source: 'Paras wuz here' } });

      await advance.reload();

      expect(advance.modifications[0].metadata.source).to.equal('Paras wuz here');
    });
  });

  it('Should use the current time for created date', async () => {
    const clock = sandbox.useFakeTimers(new Date(2011, 9, 1).getTime());
    const a = Advance.build();
    expect(a.createdDate).to.eq('2011-10-01');
    clock.setSystemTime(new Date().getTime());
    const b = Advance.build();
    expect(b.createdDate).to.eq(moment().format('YYYY-MM-DD'));
  });

  describe('getDestination', () => {
    let createTestBankAccount: (
      lastFour: string,
      displayName: string,
      options?: { isDave?: boolean },
    ) => Promise<BankAccount>;
    let user: User;

    beforeEach(() => {
      createTestBankAccount = async (
        lastFour: string,
        displayName: string,
        options?: { isDave?: boolean },
      ): Promise<BankAccount> => {
        const connectionOptions = options?.isDave
          ? { bankingDataSource: BankingDataSource.BankOfDave }
          : { bankingDataSource: BankingDataSource.Plaid };
        const connection = await factory.create('bank-connection', connectionOptions);
        user = await connection.getUser();
        return factory.create<BankAccount>('bank-account', {
          lastFour,
          bankConnectionId: connection.id,
          userId: user.id,
          subtype: BankAccountSubtype.Checking,
          displayName,
        });
      };
    });

    it('returns bank account info when disbursement processor is Synapsepay', async () => {
      const lastFour = '1234';
      const displayName = 'myBankAccount';
      const bankAccount = await createTestBankAccount(lastFour, displayName);
      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        delivery: AdvanceDelivery.Standard,
        disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
      });
      advance.bankAccount = bankAccount;

      const destination = await advance.getDestination();
      expect(destination.scheme).to.be.undefined;
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('returns debit card info when disbursement processor is Tabapay', async () => {
      const lastFour = '9000';
      const displayName = 'myCard';
      const scheme = 'mastercard';
      const bankAccount = await createTestBankAccount(lastFour, displayName);
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        bankAccountId: bankAccount.id,
        displayName,
        mask: lastFour,
        scheme,
        userId: user.id,
      });
      const advance = await factory.create<Advance>('advance', {
        bankAccountId: bankAccount.id,
        created: moment(),
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.Tabapay,
        paymentMethodId: paymentMethod.id,
        userId: user.id,
      });
      advance.paymentMethod = paymentMethod;

      const destination = await advance.getDestination();
      expect(destination.scheme).to.equal(scheme);
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('returns bank account info when disbursement processor is Dave Banking', async () => {
      const lastFour = '5678';
      const displayName = 'myDaveBankAccount';
      const bankAccount = await createTestBankAccount(lastFour, displayName, { isDave: true });
      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      });
      advance.bankAccount = bankAccount;

      const destination = await advance.getDestination();
      expect(destination.scheme).to.be.undefined;
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('returns empty destination for legacy users', async () => {
      const lastFour = '5678';
      const displayName = 'myDaveBankAccount';
      // Sets up bank connections for user.
      await createTestBankAccount(lastFour, displayName, { isDave: true });

      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: null, // legacy users may have advances without bankAccountId
        userId: user.id,
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      });
      const destination = await advance.getDestination();

      expect(destination.scheme).to.be.undefined;
      expect(destination.lastFour).to.be.undefined;
      expect(destination.displayName).to.be.undefined;
    });

    it('can fetch bankAccount when not included on the advance model', async () => {
      const lastFour = '0001';
      const displayName = 'myDaveBankAccount';
      const bankAccount = await createTestBankAccount(lastFour, displayName, { isDave: true });
      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      });

      const destination = await advance.getDestination();
      expect(destination.scheme).to.be.undefined;
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('can fetch a deleted bankAccount', async () => {
      const lastFour: string = null;
      const displayName = 'myDaveBankAccount';
      const bankAccount = await createTestBankAccount(lastFour, displayName);
      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: bankAccount.id,
        userId: user.id,
        delivery: AdvanceDelivery.Standard,
        disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
      });
      await bankAccount.destroy();

      const destination = await advance.getDestination();
      expect(destination.scheme).to.be.undefined;
      expect(destination.lastFour).to.be.null;
      expect(destination.displayName).to.equal(displayName);
    });

    it('can fetch paymentMethod when not included on the advance model', async () => {
      const lastFour = '8768';
      const displayName = 'myOtherCard';
      const scheme = 'visa';
      const bankAccount = await createTestBankAccount(lastFour, displayName);
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        bankAccountId: bankAccount.id,
        displayName,
        mask: lastFour,
        scheme,
        userId: user.id,
      });
      const advance = await factory.create<Advance>('advance', {
        created: moment(),
        bankAccountId: bankAccount.id,
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.Tabapay,
        paymentMethodId: paymentMethod.id,
        userId: user.id,
      });

      const destination = await advance.getDestination();
      expect(destination.scheme).to.be.equal(scheme);
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('can fetch a deleted payment method', async () => {
      const lastFour = '9000';
      const displayName = 'myCard';
      const scheme = 'mastercard';
      const bankAccount = await createTestBankAccount(lastFour, displayName);
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        bankAccountId: bankAccount.id,
        displayName,
        mask: lastFour,
        scheme,
        userId: user.id,
      });
      const advance = await factory.create<Advance>('advance', {
        bankAccountId: bankAccount.id,
        created: moment(),
        delivery: AdvanceDelivery.Express,
        disbursementProcessor: ExternalTransactionProcessor.Tabapay,
        paymentMethodId: paymentMethod.id,
        userId: user.id,
      });
      await paymentMethod.destroy();

      const destination = await advance.getDestination();
      expect(destination.scheme).to.equal(scheme);
      expect(destination.lastFour).to.equal(lastFour);
      expect(destination.displayName).to.equal(displayName);
    });

    it('logs an error and sends datadog metric if disbursment processor does not match', async () => {
      const advance = await factory.create<Advance>('advance', {
        disbursementProcessor: ExternalTransactionProcessor.Risepay,
      });
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const loggerStub = sandbox.stub(logger, 'info');

      const destination = await advance.getDestination();
      expect(datadogStub.callCount).to.equal(1);
      expect(loggerStub.callCount).to.equal(1);
      expect(destination).to.be.null;
    });
  });

  describe('serializeAdvanceWithTip', () => {
    const network = 'visa';

    context('advance network data', () => {
      it('sets network data to null if neither approvalCode or networkId is defined', async () => {
        const advance = await factory.create('advance', {
          approvalCode: null,
          networkId: null,
          network,
        });
        await factory.create<AdvanceTip>('advance-tip', { advanceId: advance.id });
        const advanceResponse = await advance.serializeAdvanceWithTip();
        expect(advanceResponse.network).to.be.null;
      });

      it('does not set network data to null if approvalCode or networkId is provided', async () => {
        const approvalCode = '123';
        const advance = await factory.create('advance', { approvalCode, networkId: null, network });
        await factory.create<AdvanceTip>('advance-tip', { advanceId: advance.id });
        const advanceResponse = await advance.serializeAdvanceWithTip();
        expect(advanceResponse.network).to.eql({
          settlementNetwork: network,
          approvalCode,
          networkId: null,
        });
      });
    });
  });
});
