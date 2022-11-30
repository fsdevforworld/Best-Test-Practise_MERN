import { moment } from '@dave-inc/time-lib';
import { SubscriptionBilling } from '../../src/models';

export default function(factory: any) {
  factory.define('subscription-billing', SubscriptionBilling, {
    userId: factory.assoc('subscribed-user', 'id'),
    start: () =>
      moment()
        .startOf('month')
        .format('YYYY-MM-DD'),
    end: () =>
      moment()
        .endOf('month')
        .format('YYYY-MM-DD HH:mm:ss'),
    amount: 1,
    billingCycle: () => moment().format('YYYY-MM'),
    dueDate: () => moment().format('YYYY-MM-DD'),
  });
}
