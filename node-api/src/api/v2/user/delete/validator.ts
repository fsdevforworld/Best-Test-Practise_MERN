import { IDaveRequest } from '../../../../typings';
import { ValidDeleteUserPayload } from '../../../../api/v2/user/typings';
import { UnauthorizedError } from '../../../../lib/error';

export const UNDEFINED_DELETE_USER_REASON = 'Undefined Delete User Reason';

export function validateDeleteUserRequest(req: IDaveRequest): ValidDeleteUserPayload {
  const id = parseInt(req.params.id, 10);

  const { reason, additionalInfo } = req.body;

  if (isNaN(id) || id !== req.user.id) {
    throw new UnauthorizedError();
  }

  const definedReason: string = reason ? reason.toString() : UNDEFINED_DELETE_USER_REASON;

  return { id, reason: definedReason, additionalInfo };
}
