import { Response, Request } from 'express';

import { track as _track } from '../../client';
import { TrackBody } from '../../types';

interface IDaveInternalRequest<T = any> extends Request {
  body: T;
}

export async function track(req: IDaveInternalRequest<TrackBody>, res: Response) {
  await _track(req.body);
  res.sendStatus(202);
}
