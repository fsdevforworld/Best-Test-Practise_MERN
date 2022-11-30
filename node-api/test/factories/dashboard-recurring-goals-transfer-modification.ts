import { DashboardRecurringGoalsTransferModification } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'dashboard-recurring-goals-transfer-modification',
    DashboardRecurringGoalsTransferModification,
    {
      userId: factory.assoc('user', 'id'),
      dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
      modification: {
        columnName: {
          previousValue: 'previousValue',
          currentValue: 'currentValue',
        },
      },
    },
  );
}
