import { AdvanceScreenshotResponse } from '@dave-inc/wire-typings';
import { Response } from 'express';
import { InvalidParametersError } from '../../../lib/error';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { InvalidParametersMessageKey } from '../../../translations';

import OverdraftController from './controller';

/*
 * upload screenshot to Google Cloud Storage and return url if successful
 * required body params:
 * screenshotContents
 */

async function uploadScreenshot(
  req: IDaveRequest,
  res: IDaveResponse<AdvanceScreenshotResponse>,
): Promise<Response> {
  const screenshotContents = req.file;
  if (!screenshotContents) {
    throw new InvalidParametersError(InvalidParametersMessageKey.NoImageProvided);
  }
  const screenshotUrl = await OverdraftController.upload(screenshotContents, req.user.id);
  return res.send({ screenshotUrl });
}

export default {
  uploadScreenshot,
};
