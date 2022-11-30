import { IStaticExtended, ObjectAdapter } from 'factory-girl';
import { DehydratedBaseDocument } from 'synapsepay';
import * as Faker from 'faker';
import { sample } from 'lodash';

export default function(factory: IStaticExtended) {
  factory.define<DehydratedBaseDocument>('dehydrated-base-document', Object, {
    address_city: () => Faker.address.city(),
    address_country_code: 'US',
    address_postal_code: () => Faker.address.zipCode(),
    address_street: () => Faker.address.streetAddress(),
    address_subdivision: () => Faker.address.stateAbbr(),
    alias: () => Faker.name.findName(),
    day: () => Faker.random.number({ min: 1, max: 28 }),
    email: () => Faker.internet.email(),
    entity_scope: 'NOT_KNOWN',
    entity_type: 'NOT_KNOWN',
    id: () => Faker.random.uuid(),
    id_score: null,
    ip: () => Faker.internet.ip(),
    month: () => Faker.random.number({ min: 1, max: 12 }),
    name: () => Faker.name.findName(),
    permission_scope: () => sample(['UNVERIFIED', 'SEND|RECEIVE|TIER|1', 'SEND|RECEIVE|TIER|2']),
    phone_number: () => Faker.phone.phoneNumber('+1##########'),
    physical_docs: () => [],
    screening_results: () => ({}),
    social_docs: () => [],
    virtual_docs: () => [],
    watchlists: () => sample(['PENDING', 'NO_MATCH', 'MATCH', 'FALSE_POSITIVE']),
    year: () => Faker.random.number({ min: 1920, max: 2002 }),
  });

  const adapter = new ObjectAdapter();
  factory.setAdapter(adapter, ['dehydrated-base-document']);
}
