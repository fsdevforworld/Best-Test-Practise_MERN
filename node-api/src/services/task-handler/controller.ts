import { dogstatsd } from '../../lib/datadog-statsd';

import { StandardResponse } from '@dave-inc/wire-typings';
import { IDaveResponse, IDaveRequest } from '../../typings';

async function taskController<TPayload, TPromise>(
  req: IDaveRequest<TPayload>,
  res: IDaveResponse<StandardResponse>,
  targetName: string,
  handler: (data: TPayload) => Promise<TPromise>,
  suppressErrors: boolean,
) {
  const { body } = req;

  dogstatsd.increment('google_cloud_tasks.called', { target_name: targetName });
  if (Object.keys(body).length === 0) {
    res.status(400);
    return res.send({ ok: false, data: 'A body is required for job processing.' });
  }
  dogstatsd.increment('google_cloud_tasks.received', { target_name: targetName });
  try {
    await handler(body);
    dogstatsd.increment('google_cloud_tasks.handled', { target_name: targetName });
  } catch (ex) {
    if (suppressErrors) {
      dogstatsd.increment('google_cloud_tasks.suppressed', { target_name: targetName });
      res.status(202).send({ ok: false }); // 202 = Accepted (but not necessarily completed)
    }
    throw ex;
  }
  return res.send({ ok: true });
}

export function generateController<TPayload, TPromise>(
  handler: (payload: TPayload) => Promise<TPromise>,
  targetName: string,
  suppressErrors: boolean = false,
) {
  return (req: IDaveRequest<TPayload>, res: IDaveResponse<StandardResponse>) =>
    taskController(req, res, targetName, handler, suppressErrors);
}
