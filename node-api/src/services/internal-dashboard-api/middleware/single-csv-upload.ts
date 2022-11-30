import * as config from 'config';
import * as multer from 'multer';
import { RequestHandler } from 'express';

const csvFileOpts = {
  limits: {
    fileSize: config.get<number>(
      'internalDashboardApi.dashboardBulkUpdate.maximumCSVFileSizeBytes',
    ),
    files: 1,
  },
};

const csvFileUpload: RequestHandler = multer(csvFileOpts).single('file');

export default csvFileUpload;
