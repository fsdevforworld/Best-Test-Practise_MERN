import { CreditPopCode } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('credit-pop-code', CreditPopCode, {
    code: () => `code-${Faker.random.alphaNumeric(10)}`,
  });
}
