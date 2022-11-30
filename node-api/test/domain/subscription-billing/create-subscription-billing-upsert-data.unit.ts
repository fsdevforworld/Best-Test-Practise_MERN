import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { createSubscriptionBillingUpsertData } from '../../../src/domain/subscription-billing/create-subscription-billing-upsert-data';

describe('SubsriptionBilling Controller', () => {
  describe('createSubscriptionBillingUpsertData', () => {
    it('should return an object where the dates are proper format', () => {
      const now = moment('2019-12-25');
      const subscriptionBillingUpsertData = createSubscriptionBillingUpsertData(1, now);
      expect(subscriptionBillingUpsertData).to.be.deep.equal({
        userId: 1,
        start: '2019-12-01 00:00:00',
        end: '2019-12-31 23:59:59',
        amount: 0.0,
        billingCycle: '2019-12',
      });
    });
  });
});
