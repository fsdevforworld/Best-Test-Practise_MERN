import * as Faker from 'faker';
import { moment } from '@dave-inc/time-lib';
import { EmailVerification } from '../../src/models';

export default function(factory: any) {
  factory.define('email-verification', EmailVerification, {
    userId: factory.assoc('user', 'id'),
    email: () => Faker.internet.email(),
  });

  factory.extend('email-verification', 'email-verification-verified', {
    verified: () =>
      moment()
        .subtract(1, 'month')
        .format('YYYY-MM-DD'),
  });
}
