import { SideHustleApplication } from '../../src/models';
import { moment } from '@dave-inc/time-lib';

export default function(factory: any) {
  factory.define('side-hustle-application', SideHustleApplication, {
    userId: 1,
    sideHustleJobId: 1,
    submitted: moment().format('YYYY-MM-DD HH:mm:ss'),
  });
}
