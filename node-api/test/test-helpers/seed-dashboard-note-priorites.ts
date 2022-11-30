import { DashboardNotePriority } from '../../src/models';
import { dashboardNotePriorities } from '../../bin/dev-seed/dashboard/initial-seeds';
import factory from '../factories';

function seedDashboardNotePriorities(): Promise<DashboardNotePriority[]> {
  return Promise.all(
    dashboardNotePriorities.notePrioritySeeds.map(seed =>
      factory.create<DashboardNotePriority>('dashboard-note-priority', seed),
    ),
  );
}

export default seedDashboardNotePriorities;
