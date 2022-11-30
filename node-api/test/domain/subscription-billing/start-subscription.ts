import { moment } from '@dave-inc/time-lib';
import factory from '../../factories';
import * as Subscription from '../../../src/domain/subscription-billing';
import { expect } from 'chai';
import { SubscriptionBilling } from '../../../src/models';
import { clean } from '../../test-helpers';

describe('Domain subscription Billing start subscription', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('startSubscription', () => {
    it('returns true for a new subscription', async () => {
      const start = moment();
      const user = await factory.create('user', { subscriptionStart: null });

      const isNewSubscription = await Subscription.startSubscription(user, start);

      expect(isNewSubscription).to.be.equal(true);
    });

    it('sets the subscriptionStart date', async () => {
      const start = moment();
      const user = await factory.create('user', { subscriptionStart: null });

      await Subscription.startSubscription(user, start);

      expect(user.subscriptionStart).to.be.sameMoment(start, 'date');
    });

    it('creates a subscription billing', async () => {
      const start = moment().date(10);
      const user = await factory.create('user', { subscriptionStart: null });

      await Subscription.startSubscription(user, start);

      const billing = await SubscriptionBilling.findOne({ where: { userId: user.id } });

      expect(billing).to.exist;
      expect(billing.amount).to.equal(1);
      expect(billing.start).to.be.sameMoment(start, 'second');
      expect(billing.end).to.be.sameMoment(moment(start).endOf('month'), 'second');
    });

    it('creates a subscriptionBilling with amount of 0 at the end of the month', async () => {
      const start = moment().date(27);
      const user = await factory.create('user', { subscriptionStart: null });
      await Subscription.startSubscription(user, start);

      const billing = await SubscriptionBilling.findOne({ where: { userId: user.id } });

      expect(billing).to.exist;
      expect(billing.amount).to.equal(0);
    });

    it('is ignored if the user already has a subscription start date', async () => {
      const start = moment().subtract(10, 'days');
      const user = await factory.create('user', {
        subscriptionStart: start.format('YYYY-MM-DD'),
      });
      await Subscription.startSubscription(user);

      expect(user.subscriptionStart).to.be.sameMoment(start, 'date');
    });
  });
});
