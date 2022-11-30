import { DashboardUserModification } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-user-modification', DashboardUserModification, {
    userId: factory.assoc('user', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    modification: {
      columnName: {
        previousValue: 'previousValue',
        currentValue: 'currentValue',
      },
    },
  });
}
