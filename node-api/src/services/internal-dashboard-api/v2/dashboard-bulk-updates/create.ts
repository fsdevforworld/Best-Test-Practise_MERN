import * as config from 'config';
import * as csv from 'csv-parse';
import DashboardBulkUpdate from '../../../../models/dashboard-bulk-update';
import logger from '../../../../lib/logger';
import { ActionCode, validateActionLog } from '../../domain/action-log';
import { BaseApiError, InvalidParametersError } from '../../../../lib/error';
import { bulkUpdateConfig } from '../../domain/dashboard-bulk-update/helpers';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  sequelize,
} from '../../../../models';
import { dashboardBulkUpdateSerializer } from '../../serializers';
import { getParams, processCsv } from '../../../../lib/utils';
import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { IDashboardBulkUpdateResource } from '../../serializers/dashboard-bulk-update';
import { Response } from 'express';
import { serializeActionLog } from '../../serializers/subscription';
import { uploadFileBufferToGCloud } from '../../../../lib/gcloud-storage';
import {
  csvBufferToStream,
  generateUniqueFileNameForCsv,
} from '../../domain/dashboard-bulk-update';
import { DashboardBulkUpdateExtra } from '../../domain/dashboard-bulk-update/dashboard-bulk-update-typings';

//Exporting these to use them in unit testing validation
export const CSV_FAILED_VALIDATION =
  'Given CSV file failed validation. Ensure it is formatted correctly';
export const FAILED_INSERTING_ROW_INTO_TABLE = 'Failed inserting row into table';
export const GIVEN_CSV_TOO_LARGE = `The given CSV file is larger than the maximum allowed size of ${bulkUpdateConfig.maximumCSVFileSizeBytes}`;
export const ACTION_CODE_NOT_ALLOWED = 'The given action code is not allowed';
export const INVALID_DASHBOARD_ACTION_REASON =
  'Dashboard action reason provided does not correspond to any existing Bulk Update Action Codes';
export const INVALID_EXTRA_FIELD = 'Failed parsing given extra field';
export const MAXIMUM_ROW_COUNT_EXCEEDED = `The given CSV file has more rows than allowed. Current maximum is ${bulkUpdateConfig.maximumNumberOfRows}`;
export const MISSING_CSV = 'Missing CSV file for bulk update. Request must be form-data type';
export const UNABLE_TO_UPLOAD_FILE = 'Unable to upload given CSV file to Google Cloud';

export const VALID_ACTION_CODES = [
  ActionCode.BulkUpdateFraudBlock.toString(),
  ActionCode.BulkUpdateAccountClosure.toString(),
  ActionCode.BulkUpdateAdminNote.toString(),
  ActionCode.BulkUpdateCstCancelWithoutRefund.toString(),
  ActionCode.BulkUpdateCstSuspend.toString(),
];

type DashboardBulkUpdateRequest = {
  note: string;
  internalUserId: number;
  dashboardActionReasonId: number;
  extra?: DashboardBulkUpdateExtra;
};

/*
 * Ensure CSV is formatted correctly as a CSV file. Could be enhanced to enforce more complex validation rules.
 * Returns number of rows processed in total and number of failed rows.
 */
async function validateCSV(
  csvFile: Express.Multer.File,
): Promise<{ rowsProcessedCount: number; errorCount: number }> {
  const parser: csv.Parser = csv({
    max_record_size: 100, //128000 is default, but we only expect user Ids
    ltrim: true,
    rtrim: true,
  });

  const csvStream = csvBufferToStream(csvFile.buffer);

  // Validation processing function. Currently simply reads value for a row at the given column
  const processRowFn = async (row: number[]) => {
    try {
      // Check that row length is 1
      if (row.length !== 1) {
        logger.error(`Row ${row} contains more columns than expected`);
        return false;
      }

      // Check that it is castable to number
      if (isNaN(row[0])) {
        logger.error(`Row ${row} cannot be cast to a number (Dave User IDs are numbers)`);
        return false;
      }
    } catch (ex) {
      logger.error(`error processing row in ${csvFile.filename}`, { ex });
    }
    return true;
  };

  return processCsv(csvStream, processRowFn, {
    concurrencyLimit: bulkUpdateConfig.rowProcessingBatchSize,
    shouldOutputRowStatsToConsole: true,
    parser,
  });
}

/*
 * Given a CSV file in the request, this method will validate it, assign it a unique name, and push it up to GCP.
 */
async function create(
  req: IDashboardApiRequest<DashboardBulkUpdateRequest>,
  res: IDashboardV2Response<IDashboardBulkUpdateResource>,
): Promise<Response> {
  const datadogDomainDescriptor = 'dash_bulk_update';

  // Validate the request parameters
  const givenCSV = req.file;
  if (!givenCSV) {
    throw new InvalidParametersError(MISSING_CSV, {
      statusCode: 400,
    });
  }

  let extraField = {};
  if (req.body.extra) {
    try {
      extraField = JSON.parse(req.body.extra.toString());
    } catch (error) {
      throw new BaseApiError(INVALID_EXTRA_FIELD, {
        statusCode: 400,
      });
    }
  }

  const { dashboardActionReasonId, note } = getParams(
    req.body,
    ['dashboardActionReasonId'],
    ['note'],
  );

  const dashboardActionReason = await DashboardActionReason.findByPk(dashboardActionReasonId);
  if (!dashboardActionReason) {
    throw new BaseApiError(INVALID_DASHBOARD_ACTION_REASON, {
      statusCode: 400,
    });
  }
  const dashboardAction = await DashboardAction.findByPk(dashboardActionReason.dashboardActionId);
  const dashboardActionCode = dashboardAction.code;

  if (!VALID_ACTION_CODES.includes(dashboardActionCode)) {
    throw new BaseApiError(ACTION_CODE_NOT_ALLOWED, {
      statusCode: 400,
    });
  }

  await validateActionLog(dashboardActionReasonId, dashboardActionCode as ActionCode, note);

  // This check is identical to the one the parser could do, but the parser does not give an easy way to bubble the issue up
  if (givenCSV.size > bulkUpdateConfig.maximumCSVFileSizeBytes) {
    throw new BaseApiError(GIVEN_CSV_TOO_LARGE, {
      statusCode: 400,
    });
  }

  // If given validate it (must be valid CSV, conforming to limits given as inputs to function i.e. one column an only numbers in the column)
  let csvValidationResult: { errorCount: number; rowsProcessedCount: number };
  try {
    csvValidationResult = await validateCSV(givenCSV);
  } catch (error) {
    return res.status(400).send({
      message: CSV_FAILED_VALIDATION,
      error,
    });
  }

  if (!csvValidationResult || csvValidationResult.errorCount !== 0) {
    return res.status(400).send({
      message: CSV_FAILED_VALIDATION,
    });
  }

  if (csvValidationResult.rowsProcessedCount > bulkUpdateConfig.maximumNumberOfRows) {
    return res.status(400).send({
      message: MAXIMUM_ROW_COUNT_EXCEEDED,
    });
  }

  // Save it to GCP with a unique name
  const fileNameWithoutExtension = givenCSV.originalname.replace(/\.[^/.]+$/, '');
  const uniqueFileName = generateUniqueFileNameForCsv(fileNameWithoutExtension);
  const bucketName = config.get('googleCloud.projectId').toString();
  const desiredFilePath = 'dash-bulk-update/input-files';

  logger.info(`Preparing to upload gcs://${bucketName}/${desiredFilePath}/${uniqueFileName}`);
  const gcpSaveResult = await uploadFileBufferToGCloud(
    givenCSV.buffer,
    uniqueFileName,
    bucketName,
    desiredFilePath,
    datadogDomainDescriptor,
  );

  if (!gcpSaveResult) {
    throw new BaseApiError(UNABLE_TO_UPLOAD_FILE, {
      statusCode: 500,
    });
  }
  // The CSV was successfully saved to GCP, create DB records
  let sequelizeTransactionResult;
  try {
    sequelizeTransactionResult = await sequelize.transaction(async transaction => {
      const dashboardActionLog = await DashboardActionLog.create(
        {
          internalUserId: req.internalUser.id,
          dashboardActionReasonId,
          note,
        },
        { transaction },
      );

      const dashboardBulkUpdate = await DashboardBulkUpdate.create(
        {
          inputFileRowCount: csvValidationResult.rowsProcessedCount,
          inputFileUrl: gcpSaveResult,
          dashboardActionLogId: dashboardActionLog.id,
          name: givenCSV.originalname,
          extra: extraField,
        },
        { transaction },
      );

      return { dashboardActionLog, dashboardBulkUpdate };
    });
  } catch (error) {
    const data = {
      innerErrorMessage: error.message,
    };
    throw new BaseApiError(`${FAILED_INSERTING_ROW_INTO_TABLE} ${DashboardBulkUpdate.tableName}`, {
      statusCode: 500,
      data,
    });
  }

  // Need to serialize before returning
  const serializedActionLog = await serializeActionLog(
    sequelizeTransactionResult.dashboardActionLog,
  );

  const serializedData = await dashboardBulkUpdateSerializer.serializeDashboardBulkUpdate(
    sequelizeTransactionResult.dashboardBulkUpdate,
    { dashboardActionLog: serializedActionLog },
  );

  return res.send({ data: serializedData });
}

export default create;
