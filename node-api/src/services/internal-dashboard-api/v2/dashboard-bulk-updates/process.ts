import * as config from 'config';
import { Response } from 'express';
import * as Jobs from '../../../../jobs/data';
import logger from '../../../../lib/logger';
import { DashboardActionLog, DashboardBulkUpdate } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { getOutputFileUrl, processBulkUpdate } from '../../domain/dashboard-bulk-update';
import { bulkUpdateConfig } from '../../domain/dashboard-bulk-update/helpers';
import { dashboardBulkUpdateSerializer } from '../../serializers';
import { IDashboardBulkUpdateResource } from '../../serializers/dashboard-bulk-update';
import { serializeActionLog } from '../../serializers/subscription';

async function serializeDataAndReturn(
  associatedActionLog: DashboardActionLog,
  dashboardBulkUpdate: DashboardBulkUpdate,
) {
  // Need to serialize before returning
  const serializedActionLog = await serializeActionLog(associatedActionLog);

  const serializedData = await dashboardBulkUpdateSerializer.serializeDashboardBulkUpdate(
    dashboardBulkUpdate,
    { dashboardActionLog: serializedActionLog },
  );

  return { data: serializedData };
}

/*
 * Given a CSV file in the request, this method will validate it, assign it a unique name, and push it up to GCP.
 */
async function process(
  async: boolean,
  req: IDashboardApiResourceRequest<DashboardBulkUpdate>,
  res: IDashboardV2Response<IDashboardBulkUpdateResource>,
): Promise<Response> {
  const internalUserId: number = req.internalUser.id;
  let dashboardBulkUpdate = req.resource;
  const bucketName = config.get('googleCloud.projectId').toString();
  const associatedActionLog = await DashboardActionLog.findByPk(
    dashboardBulkUpdate.dashboardActionLogId,
  );

  // Check to see if this bulk update has already been processed
  if ('PENDING' !== dashboardBulkUpdate.status) {
    logger.info(`Dashboard Bulk Update with ID:${dashboardBulkUpdate.id} is not PENDING`);
    if (dashboardBulkUpdate.outputFileUrl && dashboardBulkUpdate.inputFileUrl) {
      const outputFileKey = dashboardBulkUpdate.outputFileUrl.substr(
        dashboardBulkUpdate.inputFileUrl.indexOf(bucketName) + bucketName.length + 1, // +1 because of the slash
      );

      // Update the returned object to contain a signed URL, not the real output file URL
      dashboardBulkUpdate.outputFileUrl = await getOutputFileUrl(
        bulkUpdateConfig.gCloudAuthURLBase,
        bucketName,
        outputFileKey,
      );
    }
  } else {
    if (async) {
      logger.info(
        `Submit an async request to process Dashboard Bulk Update with ID:${dashboardBulkUpdate.id}`,
      );
      await Jobs.createProcessDashboardBulkUpdateTask({
        bucketName,
        dashboardBulkUpdateId: dashboardBulkUpdate.id,
        internalUserId,
      });
    } else {
      dashboardBulkUpdate = await processBulkUpdate({
        dashboardBulkUpdateId: dashboardBulkUpdate.id,
        internalUserId,
        bucketName,
      });
    }
  }

  // Need to serialize before returning
  return res.send(await serializeDataAndReturn(associatedActionLog, dashboardBulkUpdate));
}

export default process;
