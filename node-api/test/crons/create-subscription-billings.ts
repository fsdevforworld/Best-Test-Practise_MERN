import { expect } from 'chai';
import { Op } from 'sequelize';

import * as Task from '../../src/crons/create-subscription-billings';

import { moment } from '@dave-inc/time-lib';

import { SubscriptionBilling, User } from '../../src/models';

import factory from '../factories';
import { clean } from '../test-helpers';

describe('CreateSubscriptionBillingsTask', () => {
  const start = moment().startOf('month');
  const end = moment().endOf('month');

  before(() => clean());

  afterEach(() => clean());

  describe('#run', () => {
    it('creates a subscription billing for the time range', async () => {
      const user = await factory.create<User>('subscribed-user', {
        subscriptionStart: moment('2018-01-01'),
      });

      await Task.run();

      const billing = await SubscriptionBilling.findOne({ where: { userId: user.id } });

      expect(billing.amount).to.equal(1, 'amount is incorrect');
      expect(billing.start.isSame(start)).to.equal(true, 'start does not match');
      expect(billing.end.isSame(end, 'second')).to.equal(true, 'end does not match');
    });

    [
      {
        subscriberCount: 50,
        batchSize: 50,
      },
      {
        subscriberCount: 50,
        batchSize: 10,
      },
      {
        subscriberCount: 50,
        batchSize: 1,
      },
    ].forEach(({ subscriberCount, batchSize }) => {
      it(`handles batches correctly with ${subscriberCount} subscribers and a batch size of ${batchSize}`, async () => {
        const users = await factory.createMany<User>('subscribed-user', subscriberCount, {
          subscriptionStart: moment('2018-01-01'),
        });

        await Task.run({ batchSize });

        const billings = await SubscriptionBilling.findAll({
          where: { userId: { [Op.in]: users.map(({ id }) => id) } },
        });

        expect(billings).to.have.length(subscriberCount);

        billings.forEach(billing => {
          expect(billing.amount).to.equal(1, 'amount is incorrect');
          expect(billing.start.isSame(start)).to.equal(true, 'start does not match');
          expect(billing.end.isSame(end, 'second')).to.equal(true, 'end does not match');
        });
      });
    });
  });

  describe('#users', () => {
    it('valid user', async () => {
      const user = await factory.create<User>('subscribed-user');

      const userIds = (
        await Task.getUsersBatch({
          startDate: start,
        })
      ).map(u => u.id);

      expect(userIds).to.include(user.id);
    });

    it('deleted before start date', async () => {
      const user = await factory.create<User>('subscribed-user', {
        deleted: moment().subtract(1, 'month'),
      });

      const userIds = (
        await Task.getUsersBatch({
          startDate: start,
        })
      ).map(u => u.id);

      expect(userIds).to.not.include(user.id);
    });

    it('not subscribed', async () => {
      const user = await factory.create<User>('user');

      const userIds = (
        await Task.getUsersBatch({
          startDate: start,
        })
      ).map(u => u.id);

      expect(userIds).to.not.include(user.id);
    });

    it('subscribed after start date', async () => {
      const user = await factory.create<User>('subscribed-user', {
        subscriptionStart: moment().add(1, 'year'),
      });

      const userIds = (
        await Task.getUsersBatch({
          startDate: start,
        })
      ).map(u => u.id);

      expect(userIds).to.not.include(user.id);
    });

    it('existing billing for same cycle', async () => {
      const existingBilling = await factory.create<SubscriptionBilling>('subscription-billing', {
        start,
        end,
        amount: 1,
      });

      const userIds = (
        await Task.getUsersBatch({
          startDate: start,
        })
      ).map(u => u.id);

      expect(userIds).to.not.include(existingBilling.userId);
    });
  });
});
