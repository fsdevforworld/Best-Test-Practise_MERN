import { MembershipPause } from '../../src/models';
import { moment } from '@dave-inc/time-lib';

export default function(factory: any) {
  factory.define('membership-pause', MembershipPause, {
    userId: factory.assoc('user', 'id'),
  });

  factory.extend('membership-pause', 'unpaused-membership-pause', {
    unpausedAt: () =>
      moment()
        .subtract(1, 'month')
        .format('YYYY-MM-DD'),
  });
}
