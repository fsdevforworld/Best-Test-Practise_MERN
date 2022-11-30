import * as Faker from 'faker';

export default function(props: any) {
  return Object.assign(
    {
      account_id: Faker.random.alphaNumeric(16),
      amount: Faker.random.number(),
      category: Faker.random.word(),
      category_id: 123,
      date: Faker.date.past(),
      name: Faker.lorem.words(3),
      location: {
        address: Faker.address.streetAddress(false),
        city: Faker.address.city(),
        lat: Faker.address.latitude(),
        lon: Faker.address.longitude(),
        state: Faker.address.state(true),
        zip: Faker.address.zipCode(),
      },
      payment_meta: {
        reference_number: Faker.random.alphaNumeric(16),
      },
      pending: false,
      transaction_id: Faker.random.alphaNumeric(16),
      transaction_type: Faker.random.word(),
    },
    props,
  );
}
