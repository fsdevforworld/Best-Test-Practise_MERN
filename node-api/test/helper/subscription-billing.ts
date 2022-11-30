import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import {
  calculateAmount,
  FIRST_MONTH_FREE_CODE,
  getSubscriptionBillings,
  setDueDate,
} from '../../src/helper/subscription-billing';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import factory from '../factories';
import { clean } from '../test-helpers';

describe('SubscriptionBillingHelper', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('calculateAmount', () => {
    it('handles the firstmonthfree promotion code', () => {
      const amount = calculateAmount(moment().date(1), FIRST_MONTH_FREE_CODE);
      expect(amount).to.eq(0);
    });

    it('handles an empty promotion code', () => {
      const amount = calculateAmount(moment().date(1));
      expect(amount).to.eq(1);
    });

    it('only accepts the first month free promotion code', () => {
      const amount = calculateAmount(moment().date(1), 'wassup');
      expect(amount).to.eq(1);
    });

    it('returns 0 if there are less than 10 days left in the month', () => {
      const amount = calculateAmount(moment().date(25));
      expect(amount).to.eq(0);
    });
  });

  describe('setDueDate', () => {
    it('is the next occurence of the primary paycheck in the current month', async () => {
      const recurringTransaction = await factory.create('recurring-transaction', {
        interval: 'BIWEEKLY',
        params: ['thursday'],
        dtstart: '2018-06-01',
      });

      const [user, bankAccount] = await Bluebird.all([
        recurringTransaction.getUser(),
        recurringTransaction.getBankAccount(),
      ]);

      const [billing] = await Bluebird.all([
        factory.create('subscription-billing', {
          userId: recurringTransaction.userId,
          start: '2018-06-04 00:00:00',
          end: '2018-06-30 23:59:59',
        }),
        bankAccount.update({ mainPaycheckRecurringTransactionId: recurringTransaction.id }),
        user.update({
          defaultBankAccountId: recurringTransaction.bankAccountId,
        }),
      ]);

      await setDueDate(billing);

      await billing.reload();

      expect(billing.dueDate).to.be.sameMoment('2018-06-14', 'day');
    });

    it('is the next Friday if no paycheck date exists', async () => {
      const time = moment('2018-07-04');
      const billing = await factory.create('subscription-billing', {
        billingCycle: time.format('YYYY-MM'),
        start: time.clone().startOf('month'),
        end: time.clone().endOf('month'),
      });

      await setDueDate(billing);

      await billing.reload();

      expect(billing.dueDate.format('YYYY-MM-DD')).to.equal('2018-07-06');
    });

    it('is the end date of the billing if no Fridays remain', async () => {
      const time = moment('2018-07-28 12:00');
      const billing = await factory.create('subscription-billing', {
        billingCycle: time.format('YYYY-MM'),
        start: time,
        end: time.clone().endOf('month'),
      });

      await setDueDate(billing);

      await billing.reload();

      expect(billing.dueDate.format('YYYY-MM-DD')).to.equal('2018-07-31');
    });
  });

  describe('getSubscriptionBillings', () => {
    it('should return subscription billings with the paidByRewardsDate and subscriptionPayments with payment method', async () => {
      const user = await factory.create('user');
      const rewardsLedger = await factory.create('rewards-ledger', { userId: user.id });
      const subscriptionBilling = await factory.create('subscription-billing', {
        userId: user.id,
        rewardsLedgerId: rewardsLedger.id,
      });
      const paymentMethod = await factory.create('payment-method', { userId: user.id });
      const subscriptionPayment = await factory.create('subscription-payment', {
        paymentMethodId: paymentMethod.id,
        userId: user.id,
      });
      await factory.create('subscription-payment-line-item', {
        subscriptionPaymentId: subscriptionPayment.id,
        subscriptionBillingId: subscriptionBilling.id,
      });

      const subscriptionBillings = await getSubscriptionBillings(user.id);

      expect(subscriptionBillings.length).to.be.eq(1);
      expect(subscriptionBillings[0].paidByRewardsDate).to.be.exist;
      expect(subscriptionBillings[0].subscriptionPayments.length).to.be.eq(1);
      expect(subscriptionBillings[0].subscriptionPayments[0].paymentMethod).to.be.exist;
    });

    it('should return subscription billings with the billing cycle in decending order', async () => {
      const user = await factory.create('user');
      const now = moment('2020-01-01');
      const subscriptionBilling1 = await factory.create('subscription-billing', {
        userId: user.id,
        billingCycle: now.format(MOMENT_FORMATS.YEAR_MONTH),
        start: now,
        end: now,
      });
      const subscriptionBilling3 = await factory.create('subscription-billing', {
        userId: user.id,
        billingCycle: now
          .clone()
          .add(2, 'months')
          .format(MOMENT_FORMATS.YEAR_MONTH),
        start: now.clone().add(2, 'months'),
        end: now.clone().add(2, 'months'),
      });
      const subscriptionBilling2 = await factory.create('subscription-billing', {
        userId: user.id,
        billingCycle: now
          .clone()
          .add(1, 'months')
          .format(MOMENT_FORMATS.YEAR_MONTH),
        start: now.clone().add(1, 'months'),
        end: now.clone().add(1, 'months'),
      });

      const subscriptionBillings = await getSubscriptionBillings(user.id);

      expect(subscriptionBillings.length).to.be.eq(3);
      expect(subscriptionBillings[0].id).to.be.eq(subscriptionBilling3.id);
      expect(subscriptionBillings[1].id).to.be.eq(subscriptionBilling2.id);
      expect(subscriptionBillings[2].id).to.be.eq(subscriptionBilling1.id);
    });

    it('should return subscription billings with the subscription payment in ascending order', async () => {
      const user = await factory.create('user');
      const subscriptionBilling = await factory.create('subscription-billing', {
        userId: user.id,
      });
      const subscriptionPayment1 = await factory.create('subscription-payment', {
        userId: user.id,
        created: moment('2020-01-15'),
        amount: 1,
      });
      const subscriptionPayment3 = await factory.create('subscription-payment', {
        userId: user.id,
        created: moment('2020-03-15'),
        amount: 3,
      });
      const subscriptionPayment2 = await factory.create('subscription-payment', {
        userId: user.id,
        created: moment('2020-02-15'),
        amount: 2,
      });
      await factory.create('subscription-payment-line-item', {
        subscriptionPaymentId: subscriptionPayment1.id,
        subscriptionBillingId: subscriptionBilling.id,
      });
      await factory.create('subscription-payment-line-item', {
        subscriptionPaymentId: subscriptionPayment2.id,
        subscriptionBillingId: subscriptionBilling.id,
      });
      await factory.create('subscription-payment-line-item', {
        subscriptionPaymentId: subscriptionPayment3.id,
        subscriptionBillingId: subscriptionBilling.id,
      });

      const subscriptionBillings = await getSubscriptionBillings(user.id);
      const subscriptionPayments = subscriptionBillings[0].subscriptionPayments;

      expect(subscriptionPayments.length).to.be.eq(3);
      expect(subscriptionPayments[0].amount).to.be.eq(subscriptionPayment1.amount);
      expect(subscriptionPayments[1].amount).to.be.eq(subscriptionPayment2.amount);
      expect(subscriptionPayments[2].amount).to.be.eq(subscriptionPayment3.amount);
    });
  });
});
