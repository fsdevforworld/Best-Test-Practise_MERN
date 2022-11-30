import { Request, Response } from 'express';
import { IDaveResponse } from '../../typings';
import { StandardResponse } from '@dave-inc/wire-typings';

async function sendgridWebhook(
  req: Request,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  return res.send({ ok: true });
}

export default { sendgridWebhook };
