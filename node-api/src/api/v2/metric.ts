import { IDaveRequest, IDaveResponse } from '../../typings';
import { Response } from 'express';
import { ABTestingEvent } from '../../models';
import { getParams } from '../../lib/utils';
import { StandardResponse } from '@dave-inc/wire-typings';

async function active(req: IDaveRequest, res: Response) {
  await req.user.update({ lastActive: new Date() });
  res.status(200).send();
}

async function trackAbTestingEvent(req: IDaveRequest, res: IDaveResponse<StandardResponse>) {
  const params = getParams(req.body, ['eventName', 'results'], ['eventUuid', 'extra', 'variables']);
  await ABTestingEvent.upsert({
    userId: req.user.id,
    ...params,
  });
  res.send({ ok: true });
}

export default {
  active,
  trackAbTestingEvent,
};
