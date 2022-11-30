import { CampaignInfo } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('campaign-info', CampaignInfo, {
    userId: factory.assoc('user', 'id'),
    deviceId: () => Faker.random.alphaNumeric(16),
    appsflyerDeviceId: () => Faker.random.alphaNumeric(16),
  });
}
