import { StandardResponse } from '@dave-inc/wire-typings';
import { Request } from 'express';

import { IDaveResponse } from '../../typings';

import * as MxWebhookHelper from './helper';
import logger from '../../lib/logger';

async function ping(req: Request, res: IDaveResponse<StandardResponse>) {
  return res.send({ ok: true });
}

async function webhook(req: Request, res: IDaveResponse<StandardResponse>) {
  const { body } = req;

  logger.info('MX webhook received', { body });

  await MxWebhookHelper.handleWebhookEvent(body);

  return res.send({ ok: true });
}

export { ping, webhook };
