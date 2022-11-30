import * as Bluebird from 'bluebird';
import logger from '../../../../lib/logger';
import { ActionCode } from '../action-log';
import { bulkUpdateConfig } from './helpers';
import { chunk, flatten } from 'lodash';
import { DashboardAction, DashboardActionLog, DashboardBulkUpdate } from '../../../../models';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import { processBulkAccountClosure } from './process-bulk-account-closure';
import { processBulkAdminNote } from './process-bulk-admin-note';
import { processBulkCstUpdate } from './process-bulk-cst-update';
import { processBulkFraudBlock } from './process-bulk-fraud-block';
import { uploadFileBufferToGCloud } from '../../../../lib/gcloud-storage';
import {
  BulkUpdateProcessInput,
  BulkUpdateProcessOutputRow,
} from './dashboard-bulk-update-typings';
import {
  downloadBulkUpdateCsvAsArray,
  generateCsvFileBufferFromObjectArray,
  getOutputFileUrl,
} from './file-helpers';

async function generateAndUploadOutputFile(
  outputCSVRows: BulkUpdateProcessOutputRow[],
  bucketName: string,
  inputFileUrl: string,
): Promise<{ realOutputUrl: string; signedOutputUrl: string }> {
  // Generate the CSV buffer for upload
  const fileBuffer = generateCsvFileBufferFromObjectArray(outputCSVRows);

  // Upload the CSV
  const outputFileName = 'PROCESSED-' + inputFileUrl.replace(/^(.*[\\\/])/, ''); //Regex to pull only the file name
  const desiredFilePath = 'dash-bulk-update/output-files';
  const datadogDomainDescriptor = 'dash_bulk_update_process';
  const gcpSaveResult = await uploadFileBufferToGCloud(
    fileBuffer,
    outputFileName,
    bucketName,
    desiredFilePath,
    datadogDomainDescriptor,
  );

  const signedOutputUrl = await getOutputFileUrl(
    bulkUpdateConfig.gCloudAuthURLBase,
    bucketName,
    `${desiredFilePath}/${outputFileName}`,
  );
  return { realOutputUrl: gcpSaveResult, signedOutputUrl };
}

async function processChunk(bulkUpdateInput: BulkUpdateProcessInput) {
  const { primaryAction, inputUsers } = bulkUpdateInput;

  let outputCSVRows: BulkUpdateProcessOutputRow[] = [];
  // Depending on the action, we call a different processing function
  if (primaryAction === ActionCode.BulkUpdateFraudBlock) {
    outputCSVRows = await processBulkFraudBlock(bulkUpdateInput);
  } else if (primaryAction === ActionCode.BulkUpdateAccountClosure) {
    outputCSVRows = await processBulkAccountClosure(bulkUpdateInput);
  } else if (primaryAction === ActionCode.BulkUpdateAdminNote) {
    outputCSVRows = await processBulkAdminNote(bulkUpdateInput);
  } else if (
    primaryAction === ActionCode.BulkUpdateCstCancelWithoutRefund ||
    primaryAction === ActionCode.BulkUpdateCstSuspend
  ) {
    outputCSVRows = await processBulkCstUpdate(bulkUpdateInput);
  }
  logger.info(`Finished processing ${inputUsers.length} users`);

  return outputCSVRows;
}

/*
 * Process a bulk update
 */
export async function processBulkUpdate({
  dashboardBulkUpdateId,
  internalUserId,
  bucketName,
}: {
  dashboardBulkUpdateId: number;
  internalUserId: number;
  bucketName: string;
}): Promise<DashboardBulkUpdate> {
  logger.info(`Begin processing of Dashboard Bulk Update with ID:${dashboardBulkUpdateId}`);
  dogstatsd.increment('bulk_update.processing_begin');

  const dashboardBulkUpdate = await DashboardBulkUpdate.findByPk(dashboardBulkUpdateId);
  if ('PENDING' !== dashboardBulkUpdate.status) {
    logger.info(`Dashboard Bulk Update ${dashboardBulkUpdateId} is not PENDING, ignore`);
    return dashboardBulkUpdate;
  }

  const associatedActionLog = await DashboardActionLog.findByPk(
    dashboardBulkUpdate.dashboardActionLogId,
  );

  // Get the input CSV users list
  const dedupedInputUsers = await downloadBulkUpdateCsvAsArray(
    bucketName,
    dashboardBulkUpdate.inputFileUrl,
  );

  // chunk userId's
  const userIdChunks = chunk(dedupedInputUsers, bulkUpdateConfig.processChunkSize);

  // Start processing
  await dashboardBulkUpdate.update({ status: 'PROCESSING' });

  const dashboardActionReason = await associatedActionLog.getDashboardActionReason();
  const associatedAction = await DashboardAction.findByPk(dashboardActionReason.dashboardActionId);
  const primaryAction = associatedAction.code;

  let outputCSVRows = [];

  try {
    outputCSVRows = await Bluebird.map(
      userIdChunks,
      userIdChunk => {
        return processChunk({
          inputUsers: userIdChunk,
          dashboardBulkUpdateId: dashboardBulkUpdate.id,
          internalUserId,
          primaryAction,
          actionLogNote: associatedActionLog.note,
          reason: dashboardActionReason.reason,
          extra: dashboardBulkUpdate.extra,
          dashboardActionLogId: dashboardBulkUpdate.dashboardActionLogId,
        });
      },
      { concurrency: 1 },
    ).then(flatten);
  } catch (error) {
    logger.error(`Failed processing bulk update: ${dashboardBulkUpdate.id}`, { error });
    return dashboardBulkUpdate.update({
      status: 'FAILED',
      outputFileUrl: undefined,
    });
  }

  // upload the results to GCP
  const gcpSaveResult = await generateAndUploadOutputFile(
    outputCSVRows,
    bucketName,
    dashboardBulkUpdate.inputFileUrl,
  );

  await dashboardBulkUpdate.update({
    status: 'COMPLETED',
    outputFileUrl: gcpSaveResult.realOutputUrl,
  });

  // Update the returned object to contain a signed URL, not the real output file URL
  dashboardBulkUpdate.outputFileUrl = gcpSaveResult.signedOutputUrl;
  logger.info(`Completed processing of Dashboard Bulk Update with ID:${dashboardBulkUpdate.id}`);
  dogstatsd.increment(`bulk_update.processing_end.success`);
  return dashboardBulkUpdate;
}
