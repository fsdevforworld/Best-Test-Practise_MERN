import * as Faker from 'faker';
import { UserSettingName } from '../../src/models';

export default function(factory: any) {
  factory.define('user-setting-name', UserSettingName, {
    name: Faker.random.word,
  });
}
