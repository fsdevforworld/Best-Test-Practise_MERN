import { Response } from 'express';
import { IDaveRequest } from '../../typings';

async function create(req: IDaveRequest, res: Response): Promise<void> {
  // TODO: This is now a no-op, we should remove this once the mobile app removes calls to this endpoint
  res.status(200).send();
}

export default { create };
