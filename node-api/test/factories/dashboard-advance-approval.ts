import { DashboardAdvanceApproval } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-advance-approval', DashboardAdvanceApproval, {
    advanceApprovalId: factory.assoc('advance-approval', 'id'),
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
  });
}
