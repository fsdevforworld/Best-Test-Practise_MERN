import { DashboardActionLogEmailVerification } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-action-log-email-verification', DashboardActionLogEmailVerification, {
    dashboardActionLogId: factory.assoc('dashboard-action-log', 'id'),
    emailVerificationId: factory.assoc('email-verification', 'id'),
  });
}
