import * as Faker from 'faker';
import { UserSetting } from '../../src/models';

export default function(factory: any) {
  factory.define('user-setting', UserSetting, {
    userId: factory.assoc('user', 'id'),
    userSettingNameId: factory.assoc('user-setting-name', 'id'),
    value: Faker.random.word,
  });
}
