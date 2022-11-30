import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import factory from '../../factories';
import CollectSubscriptionTask, {
  preferAchBalanceThreshold,
} from '../../../src/consumers/subscription-payment-processor/task';
import { BankAccount, PaymentMethod, SubscriptionBilling, User } from '../../../src/models';
import * as BankingDataSync from '../../../src/domain/banking-data-sync';
import {
  SubscriptionChargeType,
  SUBSCRIPTION_COLLECTION_TRIGGER,
} from '../../../src/domain/collection';
import { clean, stubLoomisClient } from '../../test-helpers';
import {
  createFallbackCharge,
  FallbackChargeCreator,
} from '../../../src/domain/collection/create-fallback-charge';
import { ChargeableMethod, ExternalPaymentCreator } from '../../../src/typings';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('consumers/subscription-payment-processor/task', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  it('should get ACH balance threshold', () => {
    const threshold = preferAchBalanceThreshold();
    expect(threshold).to.equal(35);
  });

  describe('create charge', () => {
    let balanceStub: sinon.SinonStub;
    let bankAccount: BankAccount;
    let billing: SubscriptionBilling;

    beforeEach(async () => {
      stubLoomisClient(sandbox);
      balanceStub = sandbox.stub(BankingDataSync, 'refreshBalance');

      const user = await factory.create<User>('user');
      bankAccount = await factory.create<BankAccount>('checking-account', { userId: user.id });
      billing = await factory.create<SubscriptionBilling>('subscription-billing', {
        userId: user.id,
      });
    });

    afterEach(() => clean(sandbox));

    async function addPaymentMethod(account: BankAccount): Promise<PaymentMethod> {
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        userId: account.userId,
        bankAccountId: account.id,
      });
      await account.update({ defaultPaymentMethodId: paymentMethod.id });
      return paymentMethod;
    }

    it('should create a charge', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);

      balanceStub.resolves({ available: 20, current: 20 });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
      );
      const [charge, chargeType] = await task.createCharge(createFallbackCharge);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.BankChargeOnly);
    });

    it('should create a charge with both debit and ACH', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      balanceStub.resolves({ available: 20, current: 20 });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
      );
      const [charge, chargeType] = await task.createCharge(createFallbackCharge);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.DebitAndBankSameDayAch);
    });

    it('should create a forced ACH charge if enough balance', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = preferAchBalanceThreshold() + 10;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
      );
      const [charge, chargeType] = await task.createCharge(createFallbackCharge);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.HighBalanceForceAch);
    });

    it('should create a fallback ACH charge if sufficient funds on bank account update', async () => {
      // 6 AM PST
      let savedValidator: (ex: Error) => Promise<boolean> = null;
      const fakeFallbackChargeCreator: FallbackChargeCreator = (
        _first: ExternalPaymentCreator,
        _second: ExternalPaymentCreator,
        validator: (ex: Error) => Promise<boolean>,
      ) => {
        savedValidator = validator;
        return async () => ({
          id: 'fake',
          type: ChargeableMethod.Ach,
          status: ExternalTransactionStatus.Unknown,
          amount: -1,
          processor: ExternalTransactionProcessor.BankOfDave,
          chargeable: {},
        });
      };
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = 110;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
      );
      const [charge, chargeType] = await task.createCharge(fakeFallbackChargeCreator);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.DebitAndBankSameDayAch);

      expect(savedValidator).to.not.be.null;
      const result = await savedValidator(null);
      expect(result).to.be.eq(true);
    });
    it('should create a fallback ACH charge even below $100 on predicted-payday', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      let savedValidator: (ex: Error) => Promise<boolean> = null;
      const fakeFallbackChargeCreator: FallbackChargeCreator = (
        _first: ExternalPaymentCreator,
        _second: ExternalPaymentCreator,
        validator: (ex: Error) => Promise<boolean>,
      ) => {
        savedValidator = validator;
        return async () => ({
          id: 'fake',
          type: ChargeableMethod.Ach,
          status: ExternalTransactionStatus.Unknown,
          amount: -1,
          processor: ExternalTransactionProcessor.BankOfDave,
          chargeable: {},
        });
      };
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = 45;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.PREDICTED_PAYDAY_JOB,
      );
      const [charge, chargeType] = await task.createCharge(fakeFallbackChargeCreator);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.DebitAndBankSameDayAch);

      expect(savedValidator).to.not.be.null;
      const result = await savedValidator(null);
      expect(result).to.be.eq(true);
    });
    // This test doesn't pass through the fallback logic
    it.skip('should create a fallback ACH charge even below $100 on daily cronjob', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      let savedValidator: (ex: Error) => Promise<boolean> = null;
      const fakeFallbackChargeCreator: FallbackChargeCreator = (
        _first: ExternalPaymentCreator,
        _second: ExternalPaymentCreator,
        validator: (ex: Error) => Promise<boolean>,
      ) => {
        savedValidator = validator;
        return async () => ({
          id: 'fake',
          type: ChargeableMethod.Ach,
          status: ExternalTransactionStatus.Unknown,
          amount: -1,
          processor: ExternalTransactionProcessor.BankOfDave,
          chargeable: {},
        });
      };
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = 45;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
      );
      const [charge, chargeType] = await task.createCharge(fakeFallbackChargeCreator);
      expect(charge).to.exist;
      expect(chargeType).to.not.equal(SubscriptionChargeType.BankChargeOnly);

      expect(savedValidator).to.not.be.null;
      const result = await savedValidator(null);
      expect(result).to.be.eq(true);
    });
    it('should not a fallback ACH charge if less than 100 available on bank account update', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      let savedValidator: (ex: Error) => Promise<boolean> = null;
      const fakeFallbackChargeCreator: FallbackChargeCreator = (
        first: ExternalPaymentCreator,
        second: ExternalPaymentCreator,
        validator: (ex: Error) => Promise<boolean>,
      ) => {
        savedValidator = validator;
        return async () => ({
          id: 'fake',
          type: ChargeableMethod.Ach,
          status: ExternalTransactionStatus.Unknown,
          amount: -1,
          processor: ExternalTransactionProcessor.BankOfDave,
          chargeable: {},
        });
      };
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = 99;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
      );
      const [charge, chargeType] = await task.createCharge(fakeFallbackChargeCreator);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.DebitAndBankSameDayAch);

      expect(savedValidator).to.not.null;
      const result = await savedValidator(null);
      expect(result).to.be.eq(false);
    });

    it('should not create a forced ACH charge if wrong trigger type', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = preferAchBalanceThreshold() + 10;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
      );
      const [charge, chargeType] = await task.createCharge(createFallbackCharge);
      expect(charge).to.exist;
      expect(chargeType).to.not.equal(SubscriptionChargeType.HighBalanceForceAch);
    });

    it('should create a forced Debit charge if forceDebitOnly = true', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      await addPaymentMethod(bankAccount);

      const balance = preferAchBalanceThreshold() + 10;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
        undefined,
        true,
      );
      const [charge, chargeType] = await task.createCharge(createFallbackCharge);
      expect(charge).to.exist;
      expect(chargeType).to.equal(SubscriptionChargeType.ForcedDebitCharge);
    });

    it('should throw an error if forceDebitOnly = true and no debit card is available', async () => {
      // 6 AM PST
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);

      const balance = preferAchBalanceThreshold() + 10;
      balanceStub.resolves({ available: balance, current: balance });
      const task = new CollectSubscriptionTask(
        billing.id,
        SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
        undefined,
        true,
      );
      await expect(task.createCharge(createFallbackCharge)).to.be.rejectedWith(
        'Cannot charge debit with forceDebitOnly = true in subscription payment processor',
      );
    });
  });
});
