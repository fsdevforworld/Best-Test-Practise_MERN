import { InternalUser } from '../../src/models';

export default function(factory: any) {
  factory.define('internal-user', InternalUser, {
    email: factory.sequence('InternalUser.email', (n: number) => `employee-${n}@dave.com`),
  });
}
