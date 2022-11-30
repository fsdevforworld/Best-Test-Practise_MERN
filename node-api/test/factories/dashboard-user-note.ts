import { DashboardUserNote } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-user-note', DashboardUserNote, {
    userId: factory.assoc('user', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    dashboardNotePriorityCode: factory.assoc('dashboard-note-priority', 'code'),
  });
}
