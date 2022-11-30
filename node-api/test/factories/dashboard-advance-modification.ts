import { DashboardAdvanceModification } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-advance-modification', DashboardAdvanceModification, {
    advanceId: factory.assoc('advance', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    modification: {
      columnName: {
        previousValue: 'previousValue',
        currentValue: 'currentValue',
      },
    },
  });
}
