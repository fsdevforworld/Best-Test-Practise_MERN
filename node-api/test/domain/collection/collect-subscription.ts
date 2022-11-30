import {
  BankAccountType,
  BankingDataSource,
  ExternalTransactionStatus,
  MicroDeposit,
} from '@dave-inc/wire-typings';
import { expect } from 'chai';
import {
  collectSubscription,
  getBankAccountToCharge,
  getPastDueBilling,
  isSubscriptionWithinCollectionTimeframe,
  MAX_BILL_AGE_DAYS,
  recordExternalSubscriptionPayment,
} from '../../../src/domain/collection/collect-subscription';
import { moment } from '@dave-inc/time-lib';
import { SubscriptionCollectionAttempt, User } from '../../../src/models';
import factory from '../../factories';
import { clean, fakeDate } from '../../test-helpers';
import { BroadcastSubscriptionPayment } from '../../../src/jobs';
import { ExternalPayment } from '../../../src/typings';
import * as sinon from 'sinon';
import { Moment } from 'moment';
import { attemptChargeAndRecordProcessorError } from '../../../src/domain/collection/payment-processor';
import { createDebitCardSubscriptionCharge } from '../../../src/domain/collection/charge-debit-card';
import { createBankAccountSubscriptionCharge } from '../../../src/domain/collection/charge-bank-account';
import { SubscriptionChargeType } from '../../../src/domain/collection';
import * as Tabapay from '../../../src/lib/tabapay';
import SynapsepayNode from '../../../src/domain/synapsepay/node';

describe('subscription-collection-helper', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  const createBillingByAge = async (billAge: number) => {
    const dueDate = moment()
      .startOf('day')
      .subtract(billAge, 'days');
    return createBilling(dueDate);
  };

  const createBilling = async (dueDate: Moment, amount: number = 1) =>
    factory.create('subscription-billing', {
      dueDate: dueDate.clone(),
      billingCycle: dueDate.format('YYYY-MM'),
      start: dueDate.clone().startOf('month'),
      end: dueDate.clone().endOf('month'),
      amount,
    });

  context('isSubscriptionWithinCollectionTimeframe', () => {
    it(`does not collect bills older than ${MAX_BILL_AGE_DAYS} days`, async () => {
      fakeDate(sandbox, '2019-09-15');
      const [billing1, billing2] = await Promise.all([
        createBillingByAge(MAX_BILL_AGE_DAYS + 1),
        createBillingByAge(MAX_BILL_AGE_DAYS + 10),
      ]);
      const result1 = isSubscriptionWithinCollectionTimeframe(billing1);
      const result2 = isSubscriptionWithinCollectionTimeframe(billing2);

      expect(result1.isEligible).to.equal(false);
      expect(result2.isEligible).to.equal(false);
    });

    it(`only collects bills ${MAX_BILL_AGE_DAYS} days old (within this or last month)`, async () => {
      fakeDate(sandbox, '2019-09-15');
      const [billing1, billing2] = await Promise.all([
        createBillingByAge(1),
        createBillingByAge(MAX_BILL_AGE_DAYS),
      ]);

      const result1 = isSubscriptionWithinCollectionTimeframe(billing1);
      const result2 = isSubscriptionWithinCollectionTimeframe(billing2);

      expect(result2.isEligible).to.equal(true);
      expect(result1.isEligible).to.equal(true);
    });

    it('only collects bills within this and last month only', async () => {
      fakeDate(sandbox, '2019-09-01');
      const [
        billingBeginningThisMonth,
        billingBeginningLastMonth,
        billingEndTwoMonthsAgo,
        billing39DaysAgo,
        billing41DaysAgo,
      ] = await Promise.all([
        createBilling(moment('2019-09-01', 'YYYY-MM-DD')),
        createBilling(moment('2019-08-01', 'YYYY-MM-DD')),
        createBilling(moment('2019-07-30', 'YYYY-MM-DD')),
        createBillingByAge(MAX_BILL_AGE_DAYS - 1),
        createBillingByAge(MAX_BILL_AGE_DAYS + 1),
      ]);

      const resultBeginningThisMonth = isSubscriptionWithinCollectionTimeframe(
        billingBeginningThisMonth,
      );
      const resultBeginningLastMonth = isSubscriptionWithinCollectionTimeframe(
        billingBeginningLastMonth,
      );
      const resultEndTwoMonthsAgo = isSubscriptionWithinCollectionTimeframe(billingEndTwoMonthsAgo);
      const result39DaysAgo = isSubscriptionWithinCollectionTimeframe(billing39DaysAgo);
      const result41DaysAgo = isSubscriptionWithinCollectionTimeframe(billing41DaysAgo);

      expect(resultBeginningThisMonth.isEligible).to.equal(true);
      expect(resultBeginningLastMonth.isEligible).to.equal(true);
      expect(resultEndTwoMonthsAgo.isEligible).to.equal(false);
      expect(result39DaysAgo.isEligible).to.equal(false);
      expect(result41DaysAgo.isEligible).to.equal(false);
    });
  });

  context('getPastDueBilling()', () => {
    it(`only get past due billings that are ${MAX_BILL_AGE_DAYS} days old or newer`, async () => {
      fakeDate(sandbox, '2019-09-15');
      const [billing1, billing2, billing3, billing4] = await Promise.all([
        createBillingByAge(1),
        createBillingByAge(MAX_BILL_AGE_DAYS - 1),
        createBillingByAge(MAX_BILL_AGE_DAYS + 1),
        createBillingByAge(0),
      ]);

      const [unpaidBilling1, unpaidBilling2, unpaidBilling3, unpaidBilling4] = await Promise.all([
        getPastDueBilling(billing1.userId),
        getPastDueBilling(billing2.userId),
        getPastDueBilling(billing3.userId),
        getPastDueBilling(billing4.userId),
      ]);

      // Bills can be collected
      expect(unpaidBilling1.id).to.eq(billing1.id);
      expect(unpaidBilling2.id).to.eq(billing2.id);

      // Bill is too old to collect
      expect(unpaidBilling3).to.eq(undefined);

      // Bill is too new to collect
      expect(unpaidBilling4).to.eq(undefined);
    });

    it(`only get past due billings that are within this or last month`, async () => {
      fakeDate(sandbox, '2019-09-01');
      const [
        billingBeginningThisMonth,
        billingEndLastMonth,
        billingBeginningLastMonth,
        billingEndTwoMonthsAgo,
        billing39DaysAgo,
        billing41DaysAgo,
      ] = await Promise.all([
        createBilling(moment('2019-09-01', 'YYYY-MM-DD')),
        createBilling(moment('2019-08-31', 'YYYY-MM-DD')),
        createBilling(moment('2019-08-01', 'YYYY-MM-DD')),
        createBilling(moment('2019-07-30', 'YYYY-MM-DD')),
        createBillingByAge(MAX_BILL_AGE_DAYS - 1),
        createBillingByAge(MAX_BILL_AGE_DAYS + 1),
      ]);

      const [
        resultBeginningThisMonth,
        resultEndLastMonth,
        resultBeginningLastMonth,
        resultEndTwoMonthsAgo,
        result39DaysAgo,
        result41DaysAgo,
      ] = await Promise.all([
        getPastDueBilling(billingBeginningThisMonth.userId),
        getPastDueBilling(billingEndLastMonth.userId),
        getPastDueBilling(billingBeginningLastMonth.userId),
        getPastDueBilling(billingEndTwoMonthsAgo.userId),
        getPastDueBilling(billing39DaysAgo.userId),
        getPastDueBilling(billing41DaysAgo.userId),
      ]);

      // Bill is too new to be collected (not yet past-due)
      expect(resultBeginningThisMonth).to.eq(undefined);

      // Bills can be collected
      expect(resultEndLastMonth.id).to.eq(billingEndLastMonth.id);
      expect(resultBeginningLastMonth.id).to.eq(billingBeginningLastMonth.id);

      // Bill is too old to collect
      expect(resultEndTwoMonthsAgo).to.eq(undefined);
      expect(result39DaysAgo).to.eq(undefined);
      expect(result41DaysAgo).to.eq(undefined);
    });

    it('does not get past due when amount is 0', async () => {
      const billing = await createBilling(moment().subtract(1, 'day'), 0);
      const pastDueBill = await getPastDueBilling(billing.userId);
      expect(pastDueBill).to.eq(undefined);
    });
  });

  describe('collect', () => {
    it('pays the billing', async () => {
      const billing = await factory.create('subscription-billing');
      const charge = () => factory.build('external-payment');

      await collectSubscription(
        billing,
        charge,
        SubscriptionChargeType.DebitAndBankSameDayAch,
        'test',
      );

      await billing.reload();

      const isPaid = await billing.isPaid();

      expect(isPaid).to.equal(true);
    });

    it('does not attempt collection if another collection attempt is processing', async () => {
      const billing = await factory.create('subscription-billing');
      const charge = () => factory.build('external-payment');

      await factory.create('subscription-collection-attempt', {
        processing: true,
        subscriptionBillingId: billing.id,
      });

      await expect(
        collectSubscription(billing, charge, SubscriptionChargeType.BankChargeOnly, 'test'),
      ).to.be.rejectedWith('Collection already in progress');
    });

    it('removes the processing flag from the collection attempt', async () => {
      const billing = await factory.create('subscription-billing');
      const charge = () => factory.build('external-payment');

      const collectionAttempt = await collectSubscription(
        billing,
        charge,
        SubscriptionChargeType.HighBalanceForceAch,
        'test',
      );

      expect(collectionAttempt.processing).to.equal(null);
    });

    it('queues a job to broadcast the payment to analytics', async () => {
      await BroadcastSubscriptionPayment.queue.empty();

      const billing = await factory.create('subscription-billing');
      const charge = () => factory.build('external-payment');

      const { subscriptionPaymentId } = await collectSubscription(
        billing,
        charge,
        SubscriptionChargeType.DebitAndBankSameDayAch,
        'test',
      );

      const [job] = await BroadcastSubscriptionPayment.queue.getWaiting();

      expect(job.data).to.deep.equal({
        subscriptionPaymentId,
      });
    });

    it('creates collection attempt with metadata', async () => {
      const billing = await factory.create('subscription-billing');
      const charge = () => factory.build('external-payment');

      await collectSubscription(
        billing,
        charge,
        SubscriptionChargeType.DebitAndBankSameDayAch,
        'a-test-trigger',
      );

      const attempt = await SubscriptionCollectionAttempt.findOne({
        where: { subscriptionBillingId: billing.id },
      });
      expect(attempt.trigger).to.equal('a-test-trigger');
      expect(attempt.extra.chargeType).to.equal(SubscriptionChargeType.DebitAndBankSameDayAch);
    });
  });

  describe('recordExternalSubscriptionPayment', () => {
    it('recordExternalSubscriptionPayment returns if externalPayment is null', async () => {
      // This is due to unknown errors being thrown during subscription payment processing which we should keep in PENDING and handle later
      const subscriptionPayment = await factory.create('subscription-payment');
      const externalPayment: ExternalPayment = undefined;
      const result = await recordExternalSubscriptionPayment(subscriptionPayment, externalPayment);
      expect(result).to.deep.equal(subscriptionPayment);
    });
  });

  describe('attemptChargeAndRecordProcessorError saves information when unknown error occurs', () => {
    it('saves paymentMethodId when an unknown error occurs from charging a payment method', async () => {
      const paymentMethod = await factory.create('payment-method');

      const subscriptionPayment = await factory.create('subscription-payment', {
        userId: paymentMethod.userId,
        status: ExternalTransactionStatus.Pending,
        bankAccountId: null,
        paymentMethodId: null,
        externalProcessor: null,
      });

      sandbox.stub(Tabapay, 'retrieve').throws(new Error('test'));

      const charge = createDebitCardSubscriptionCharge(paymentMethod);

      await attemptChargeAndRecordProcessorError(charge, 1, subscriptionPayment, 'test');
      await subscriptionPayment.reload();

      expect(subscriptionPayment.paymentMethodId).to.eq(paymentMethod.id);
    });

    it('saves bankAccountId when an unknown error occurs from charging a bank account', async () => {
      const user = await factory.create('user', {
        firstName: 'test',
        lastName: 'test',
      });

      const [bankAccount, subscriptionPayment] = await Promise.all([
        factory.create('bank-account', {
          microDeposit: MicroDeposit.COMPLETED,
        }),
        factory.create('subscription-payment', {
          userId: user.id,
          status: ExternalTransactionStatus.Pending,
          bankAccountId: null,
          paymentMethodId: null,
          externalProcessor: null,
        }),
      ]);

      sandbox.stub(SynapsepayNode, 'charge').throws(new Error('test'));

      const charge = await createBankAccountSubscriptionCharge(bankAccount, {
        shouldCheckACHWindow: false,
      });

      try {
        await attemptChargeAndRecordProcessorError(charge, 1, subscriptionPayment, 'test');
      } catch (ex) {}

      await subscriptionPayment.reload();
      expect(subscriptionPayment.bankAccountId).to.eq(bankAccount.id);
    });
  });

  describe('getBankAccountToCharge', () => {
    it("is the user's default bank account", async () => {
      const billing = await factory.create('subscription-billing');
      const bankConnection = await factory.create('bank-connection', { userId: billing.userId });
      const [user, , primaryAccount] = await Promise.all([
        billing.getUser(),
        factory.create('bank-account', {
          bankConnectionId: bankConnection,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: bankConnection,
          type: BankAccountType.Depository,
        }),
      ]);

      await user.update({ defaultBankAccountId: primaryAccount.id });

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount.id).to.equal(primaryAccount.id);
    });

    it('falls back to the account with valid credentials', async () => {
      const billing = await factory.create('subscription-billing');
      const bankConnection = await factory.create('bank-connection', { userId: billing.userId });

      const [, accountWithCard] = await Promise.all([
        factory.create('bank-account', {
          bankConnectionId: bankConnection,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: bankConnection,
          type: BankAccountType.Depository,
        }),
      ]);

      await factory.create('payment-method', {
        bankAccountId: accountWithCard.id,
      });

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount.id).to.equal(accountWithCard.id);
    });

    it('falls back to the account with a valid debit card', async () => {
      const billing = await factory.create('subscription-billing');

      const [valid, invalid] = await Promise.all([
        factory.create('bank-connection', { userId: billing.userId, hasValidCredentials: true }),
        factory.create('bank-connection', { userId: billing.userId, hasValidCredentials: false }),
      ]);

      const [validAccount] = await Promise.all([
        factory.create('bank-account', {
          bankConnectionId: valid,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: invalid,
          type: BankAccountType.Depository,
        }),
      ]);

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount.id).to.equal(validAccount.id);
    });

    it('does not fall back to dave banking accounts', async () => {
      const billing = await factory.create('subscription-billing');

      const [
        invalidExternalConnection,
        validDaveBankingConnection,
        validExternalConnection,
      ] = await Promise.all([
        factory.create('bank-connection', {
          userId: billing.userId,
          bankingDataSource: BankingDataSource.Plaid,
          hasValidCredentials: false,
        }),
        factory.create('bank-connection', {
          userId: billing.userId,
          bankingDataSource: BankingDataSource.BankOfDave,
          hasValidCredentials: true,
        }),
        factory.create('bank-connection', {
          userId: billing.userId,
          bankingDataSource: BankingDataSource.Plaid,
          hasValidCredentials: true,
        }),
      ]);

      const [
        validExternalAccount,
        validDaveBankingAccount,
        invalidExternalAccount,
      ] = await Promise.all([
        factory.create('bank-account', {
          bankConnectionId: validExternalConnection,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: validDaveBankingConnection,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: invalidExternalConnection,
          type: BankAccountType.Depository,
        }),
      ]);

      await User.update(
        { defaultBankAccountId: validDaveBankingAccount.id },
        { where: { id: billing.userId } },
      );

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount.id).to.equal(validExternalAccount.id);
      expect(chargeAccount.id).to.not.equal(invalidExternalAccount.id);
      expect(chargeAccount.id).to.not.equal(validDaveBankingAccount.id);
    });

    it('does not return dave banking even if it is the only valid account', async () => {
      const billing = await factory.create('subscription-billing');

      const [invalidExternalConnection, validDaveBankingConnection] = await Promise.all([
        factory.create('bank-connection', {
          userId: billing.userId,
          bankingDataSource: BankingDataSource.Plaid,
          hasValidCredentials: false,
        }),
        factory.create('bank-connection', {
          userId: billing.userId,
          bankingDataSource: BankingDataSource.BankOfDave,
          hasValidCredentials: true,
        }),
      ]);

      const [validDaveBankingAccount, invalidExternalAccount] = await Promise.all([
        factory.create('bank-account', {
          bankConnectionId: validDaveBankingConnection,
          type: BankAccountType.Depository,
        }),
        factory.create('bank-account', {
          bankConnectionId: invalidExternalConnection,
          type: BankAccountType.Depository,
        }),
      ]);

      await User.update(
        { defaultBankAccountId: validDaveBankingAccount.id },
        { where: { id: billing.userId } },
      );

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount.id).to.equal(invalidExternalAccount.id);
    });

    it('does not return any account if dave banking is the only option', async () => {
      const billing = await factory.create('subscription-billing');

      const validDaveBankingConnection = await factory.create('bank-connection', {
        userId: billing.userId,
        bankingDataSource: BankingDataSource.BankOfDave,
        hasValidCredentials: true,
      });

      await factory.create('bank-account', {
        bankConnectionId: validDaveBankingConnection,
        type: BankAccountType.Depository,
      });

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount).to.equal(null);
    });

    it('is null when there are no eligible accounts', async () => {
      const billing = await factory.create('subscription-billing');

      const chargeAccount = await getBankAccountToCharge(billing);

      expect(chargeAccount).to.equal(null);
    });
  });
});
