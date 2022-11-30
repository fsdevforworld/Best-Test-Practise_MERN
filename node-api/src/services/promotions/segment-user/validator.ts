import { IDaveRequest } from '../../../typings';
import { ValidateCreateSegmentUserResponse } from '../typings';
import { getParams } from '../../../lib/utils';

export function validateCreateSegmentUser(req: IDaveRequest): ValidateCreateSegmentUserResponse {
  const { segmentId, referrerId } = getParams(req.body, ['segmentId'], ['referrerId']);

  return { userId: req.user.id, segmentId, referrerId };
}
