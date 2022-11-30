import { Response } from 'express';
import { DashboardBulkUpdate } from '../../../../models';
import { IDashboardApiResourceRequest } from '../../../../typings';
import { getGCSFileStream } from '../../../../lib/gcloud-storage';
import * as config from 'config';
import { getFileKey } from '../../domain/dashboard-bulk-update/file-helpers';
import { InvalidVerificationError } from '@dave-inc/error-types';

const bucketName = config.get('googleCloud.projectId').toString();

async function download(req: IDashboardApiResourceRequest<DashboardBulkUpdate>, res: Response) {
  const { outputFileUrl, name, status } = req.resource;

  if (status !== 'COMPLETED') {
    throw new InvalidVerificationError('Must have a completed status');
  }

  const csvStream = await getGCSFileStream(bucketName, getFileKey(bucketName, outputFileUrl));
  csvStream.on('error', error => {
    csvStream.destroy(error);
    res.sendStatus(500);
  });

  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.set('Access-Control-Expose-Headers', 'Content-Disposition');

  csvStream.pipe(res);
}

export default download;
