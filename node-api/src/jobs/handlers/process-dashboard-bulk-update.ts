import { processBulkUpdate } from '../../services/internal-dashboard-api/domain/dashboard-bulk-update';
import { ProcessDashboardBulkUpdateData } from '../data';

export async function processDashboardBulkUpdate(
  data: ProcessDashboardBulkUpdateData,
): Promise<void> {
  await processBulkUpdate({
    dashboardBulkUpdateId: data.dashboardBulkUpdateId,
    internalUserId: data.internalUserId,
    bucketName: data.bucketName,
  });
}
