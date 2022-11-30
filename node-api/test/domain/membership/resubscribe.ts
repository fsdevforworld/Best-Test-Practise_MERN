import * as sinon from 'sinon';
import { expect } from 'chai';
import factory from '../../factories';
import { resubscribe } from '../../../src/domain/membership';
import { clean, fakeDateTime } from '../../test-helpers';
import { moment } from '@dave-inc/time-lib';

const sandbox = sinon.createSandbox();

describe('resubscribe', () => {
  afterEach(() => clean(sandbox));

  context('at beginning of month', () => {
    before(() => {
      fakeDateTime(sandbox, moment().startOf('month'));
    });

    it('resumes billing and charges user for current month', async () => {
      const user = await factory.create('user', { subscriptionFee: 0 });
      const subscriptionBilling = await factory.create('subscription-billing', {
        userId: user.id,
        amount: 0,
      });

      await resubscribe(user);

      await Promise.all([user.reload(), subscriptionBilling.reload()]);

      expect(user.subscriptionFee).to.eq(1);
      expect(subscriptionBilling.amount).to.eq(1);
    });
  });

  context('at end of month', () => {
    before(() => {
      fakeDateTime(sandbox, moment().endOf('month'));
    });

    it('resumes billing but does not charge user for current month', async () => {
      const user = await factory.create('user', { subscriptionFee: 0 });
      const subscriptionBilling = await factory.create('subscription-billing', {
        userId: user.id,
        amount: 0,
      });

      await resubscribe(user);

      await Promise.all([user.reload(), subscriptionBilling.reload()]);

      expect(user.subscriptionFee).to.eq(1);
      expect(subscriptionBilling.amount).to.eq(0);
    });
  });
});
