import * as Faker from 'faker';
import { IStaticExtended } from 'factory-girl';
import { ABTestingEvent } from '../../src/models';

export default function(factory: IStaticExtended) {
  factory.define('ab-testing-event', ABTestingEvent, {
    userId: factory.assoc('user', 'id'),
    eventName: Faker.random.word,
  });
}
