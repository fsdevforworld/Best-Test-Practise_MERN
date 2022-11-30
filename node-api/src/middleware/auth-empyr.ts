import { Request, Response } from 'express';
import * as config from 'config';
import { EmpyrConfig } from '../typings';
import { verifyPayload } from '../lib/crypto';
import { ForbiddenError } from '../lib/error';
import { ExternalEvent } from '../translations';

const empyrConfig: EmpyrConfig = config.get('empyr');

const EMPYR_WEBHOOK_PATH = '/v2/empyr_webhook/rewards';

/* bodyParser makes it impossible to access the raw request body (and to verify that a request is from Empyr,
  we _need_ to access the raw request body) in any middleware/request handler inserted after it, so we run this
  verification function for all requests to EMPYR_WEBHOOK_PATH
*/
export default (req: Request, res: Response, raw: Buffer) => {
  if (req.path === EMPYR_WEBHOOK_PATH) {
    if (
      !req.headers ||
      !req.headers.notifysignature ||
      !verifyPayload(raw, req.headers.notifysignature as string, empyrConfig.clientSecret, 'sha256')
    ) {
      throw new ForbiddenError(ExternalEvent.EmpyrSignature);
    }
  }
};
