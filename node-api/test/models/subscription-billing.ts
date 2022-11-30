import { clean } from '../test-helpers';
import factory from '../factories';
import {
  SubscriptionBilling,
  SubscriptionPayment,
  PaymentMethod,
  BankAccount,
  Institution,
} from '../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as Faker from 'faker';

describe('SubscriptionBilling', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('scopes', () => {
    describe('unpaid', () => {
      it('gets unpaid billings', async () => {
        const billing = await factory.create('subscription-billing', { amount: 1 });

        const unpaids = await SubscriptionBilling.scope('unpaid').findAll();

        const ids = unpaids.map(b => b.id);
        expect(ids).to.deep.equal([billing.id]);
      });

      it('excludes free billings', async () => {
        await factory.create('subscription-billing', { amount: 0 });

        const unpaids = await SubscriptionBilling.scope('unpaid').findAll();

        const ids = unpaids.map(b => b.id);
        expect(ids).to.deep.equal([]);
      });

      it('excludes paid billings', async () => {
        const subscriptionPayment = await factory.create('subscription-payment', {
          status: ExternalTransactionStatus.Completed,
        });
        const billing = await factory.create('subscription-billing', {
          amount: 1,
          userId: subscriptionPayment.userId,
        });

        await billing.addSubscriptionPayment(subscriptionPayment);

        const unpaids = await SubscriptionBilling.scope('unpaid').findAll();

        const ids = unpaids.map(b => b.id);
        expect(ids).to.deep.equal([]);
      });

      it('includes billings with returned payments', async () => {
        const subscriptionPayment = await factory.create('subscription-payment', {
          status: ExternalTransactionStatus.Returned,
        });
        const billing = await factory.create('subscription-billing', {
          amount: 1,
          userId: subscriptionPayment.userId,
        });

        await billing.addSubscriptionPayment(subscriptionPayment);

        const unpaids = await SubscriptionBilling.scope('unpaid').findAll();

        const ids = unpaids.map(b => b.id);
        expect(ids).to.contain(billing.id);
      });
    });
  });

  describe('isAwaitingPayment', () => {
    it('returns false for zero amount', async () => {
      const subscriptionBilling = await factory.create('subscription-billing', { amount: 0 });
      expect(await subscriptionBilling.isAwaitingPayment()).to.eq(false);
    });

    it('returns true for unpaid non-zero amount', async () => {
      const subscriptionBilling = await factory.create('subscription-billing', { amount: 1 });
      const payment = await factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Unknown,
      });
      await subscriptionBilling.addSubscriptionPayment(payment);

      expect(await subscriptionBilling.isAwaitingPayment()).to.eq(true);
    });

    it('returns false for paid non-zero amount', async () => {
      const subscriptionBilling = await factory.create('subscription-billing', { amount: 1 });
      const payment = await factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
      });
      await subscriptionBilling.addSubscriptionPayment(payment);

      expect(await subscriptionBilling.isAwaitingPayment()).to.eq(false);
    });
  });

  describe('serialize', () => {
    it('should return payment display name when payment method exists', async () => {
      const { id: userId } = await factory.create('user');
      const displayName = 'Visa: 0000';
      const paymentMethod = await factory.create('payment-method', {
        userId,
        displayName,
      });
      const subscriptionBilling = await factory.create('subscription-billing', {
        amount: 1,
        userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
        userId,
        paymentMethodId: paymentMethod.id,
      });
      await subscriptionBilling.addSubscriptionPayment(subscriptionPayment);
      await subscriptionBilling.reload({
        include: [
          {
            model: SubscriptionPayment,
            required: false,
            include: [
              {
                model: PaymentMethod,
                required: false,
              },
            ],
          },
        ],
      });

      const serialized = subscriptionBilling.serialize();
      const paymentDisplayName = serialized.subscriptionPayments[0].paymentDisplayName;

      expect(paymentDisplayName).to.be.eq(displayName);
    });

    it('should return payment display name when bank acc exists', async () => {
      const { id: userId } = await factory.create('user');
      const bankConnection = await factory.create('bank-connection', {
        userId,
        hasValidCredentials: true,
        hasTransactions: true,
      });
      const institution = await factory.create('institution', {
        plaidInstitutionId: `ins_${Faker.random.number(999999)}`,
        displayName: 'Chase',
      });
      const bankAccount = await factory.create('bank-account', {
        userId,
        institutionId: institution.id,
        bankConnectionId: bankConnection.id,
        displayName: 'Savings Account',
        current: 1400,
        available: 1400,
        lastFour: 1234,
      });

      const subscriptionBilling = await factory.create('subscription-billing', {
        amount: 1,
        userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
        userId,
        bankAccountId: bankAccount.id,
      });
      await subscriptionBilling.addSubscriptionPayment(subscriptionPayment);
      await subscriptionBilling.reload({
        include: [
          {
            model: SubscriptionPayment,
            required: false,
            include: [
              {
                model: PaymentMethod,
                required: false,
              },
              {
                model: BankAccount,
                required: false,
                include: [
                  {
                    model: Institution,
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
      });

      const serialized = subscriptionBilling.serialize();
      const paymentDisplayName = serialized.subscriptionPayments[0].paymentDisplayName;

      expect(paymentDisplayName).to.be.eq('Chase: 1234');
    });

    it('should return undefined when neither payment method nor bank acc exists', async () => {
      const { id: userId } = await factory.create('user');
      const subscriptionBilling = await factory.create('subscription-billing', {
        amount: 1,
        userId,
      });
      const subscriptionPayment = await factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
        userId,
      });
      await subscriptionBilling.addSubscriptionPayment(subscriptionPayment);
      await subscriptionBilling.reload({ include: [SubscriptionPayment] });

      const serialized = subscriptionBilling.serialize();
      const paymentDisplayName = serialized.subscriptionPayments[0].paymentDisplayName;

      expect(paymentDisplayName).to.be.undefined;
    });
  });
});
