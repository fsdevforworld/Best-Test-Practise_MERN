import * as Faker from 'faker';
import AdvanceTip from '../../src/models/advance-tip';

export default function(factory: any) {
  factory.define('advance-tip', AdvanceTip, {
    amount: () => Faker.finance.amount(),
    percent: () => Faker.random.number(100),
    advanceId: factory.assoc('advance'),
  });
}
