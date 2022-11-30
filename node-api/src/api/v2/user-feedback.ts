import { UserFeedback } from '../../models';
import { InvalidParametersError } from '../../lib/error';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { Response } from 'express';
import { StandardResponse } from '@dave-inc/wire-typings';

async function create(req: IDaveRequest, res: IDaveResponse<StandardResponse>): Promise<Response> {
  const user = req.user;
  const userId = user.id;
  const { feedback, context } = req.body;

  if (!feedback) {
    throw new InvalidParametersError(null, {
      required: ['feedback'],
      provided: Object.keys(req.body),
    });
  }

  await UserFeedback.create({
    userId,
    feedback,
    context,
  });

  return res.send({ ok: true });
}

export default { create };
