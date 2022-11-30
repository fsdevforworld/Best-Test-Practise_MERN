import { IStaticExtended, ObjectAdapter } from 'factory-girl';
import { DehydratedUser } from 'synapsepay';
import * as Faker from 'faker';
import { sample } from 'lodash';

export default function(factory: IStaticExtended) {
  const factoryName = 'dehydrated-synapsepay-user';

  factory.define<DehydratedUser>(factoryName, Object, {
    _id: () => Faker.random.uuid(),
    _links: () => ({
      self: {
        href: Faker.internet.url(),
      },
    }),
    client: () => ({
      id: Faker.random.alphaNumeric(),
      name: Faker.random.word(),
    }),
    documents: () => [],
    emails: () => [],
    extra: () => ({
      cip_tag: 1,
      date_joined: Faker.date.past().valueOf(),
      is_business: false,
      is_trusted: false,
      last_updated: Faker.date.recent().valueOf(),
      supp_id: Faker.random.number(),
      note: null,
      public_note: null,
    }),
    flag: () => sample(['NOT-FLAGGED', 'FLAGGED']),
    flag_code: () =>
      sample([
        null,
        'PENDING_REVIEW|ACCOUNT_CLOSURE|BLOCKED_INDUSTRY',
        'PENDING_REVIEW|ACCOUNT_CLOSURE|HIGH_RISK',
      ]),
    ips: () => [Faker.internet.ip()],
    legal_names: () => [Faker.name.findName()],
    logins: () => [{ email: Faker.internet.email(), scope: 'READ_AND_WRITE' }],
    permission: () =>
      sample(['UNVERIFIED', 'SEND-AND-RECEIVE', 'LOCKED', 'CLOSED', 'MAKE-IT-GO-AWAY']),
    permission_code: null,
    phone_numbers: () => [Faker.phone.phoneNumber('+1##########')],
    refresh_token: () => Faker.random.alphaNumeric(),
    watchlists: () => sample(['PENDING', 'NO_MATCH', 'SOFT_MATCH', 'MATCH', 'FALSE_POSITIVE']),
  });

  const adapter = new ObjectAdapter();
  factory.setAdapter(adapter, factoryName);
}
