import * as Faker from 'faker';
import { SynapsepayDocument } from '../../src/models';

export default function(factory: any) {
  factory.define('synapsepay-document', SynapsepayDocument, {
    userId: factory.assoc('user', 'id'),
    phoneNumber: Faker.phone.phoneNumber,
    synapsepayDocId: Faker.hacker.phrase,
    synapsepayUserId: Faker.hacker.phrase,
    userNotified: 1,
    email: Faker.internet.email,
    day: '1',
    month: '1',
    year: '1',
    addressStreet: Faker.address.streetAddress,
    addressCity: Faker.address.city,
    addressPostalCode: Faker.address.zipCode,
    ip: Faker.internet.ip,
    ssn: '123-45-6789',
    licenseStatus: 'VALID',
    name: Faker.name.findName,
    ssnStatus: 'VALID',
    permission: 'SEND-AND-RECEIVE',
  });

  factory.extend('synapsepay-document', 'synapsepay-document-ssn-invalid', {
    ssnStatus: 'INVALID',
    licenseStatus: 'VALID',
    permission: 'LOCKED',
  });

  factory.extend('synapsepay-document', 'synapsepay-document-license-valid', {
    ssnStatus: 'INVALID',
    licenseStatus: 'VALID',
    permission: 'UNVERIFIED',
  });

  factory.extend('synapsepay-document', 'synapsepay-document-license-invalid', {
    ssnStatus: 'INVALID',
    licenseStatus: 'INVALID',
    permission: 'UNVERIFIED',
  });
}
