import { expect } from 'chai';
import factory from '../../factories';
import { unsubscribe } from '../../../src/domain/membership';

describe('unsubscribe', () => {
  it('removes subscription fee and clears current subscription billing', async () => {
    const user = await factory.create('user', { subscriptionFee: 1 });
    const subscriptionBilling = await factory.create('subscription-billing', {
      userId: user.id,
      amount: 1,
    });

    await unsubscribe(user);

    await Promise.all([user.reload(), subscriptionBilling.reload()]);

    expect(user.subscriptionFee).to.eq(0);
    expect(subscriptionBilling.amount).to.eq(0);
  });
});
