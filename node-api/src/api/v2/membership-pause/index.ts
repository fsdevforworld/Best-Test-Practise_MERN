import { Response } from 'express';
import { StandardResponse, MembershipPauseResponse } from '@dave-inc/wire-typings';
import { pause, unpause } from '../../../domain/membership';
import { IDaveRequest, IDaveResponse } from '../../../typings/dave-request-response';
import { InvalidParametersError } from '../../../lib/error';

async function create(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse<MembershipPauseResponse>>,
): Promise<Response> {
  const { success, msg, membershipPause, interpolations } = await pause(req.user);

  if (!success) {
    throw new InvalidParametersError(msg, { interpolations });
  }

  return res.send({ ok: true, data: membershipPause.serialize() });
}

async function resumeMembership(
  req: IDaveRequest,
  res: IDaveResponse<StandardResponse<MembershipPauseResponse>>,
): Promise<Response> {
  await unpause(req.user);

  return res.send({ ok: true });
}

export default {
  create,
  resumeMembership,
};
