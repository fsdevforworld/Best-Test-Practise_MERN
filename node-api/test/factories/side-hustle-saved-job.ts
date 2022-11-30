import { SideHustleSavedJob } from '../../src/models';

export default function(factory: any) {
  factory.define('side-hustle-saved-job', SideHustleSavedJob, {
    userId: factory.assoc('user', 'id'),
    sideHustleId: factory.assoc('side-hustle', 'id'),
  });
}
