import promotionsClient, { CreateSegmentUserResponse } from '@dave-inc/promotions-client';
import { Response } from 'express';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { getAuthenticationHeader } from '../../../../src/domain/authentication';
import { validateCreateSegmentUser } from './validator';

async function createSegmentUser(
  req: IDaveRequest,
  res: IDaveResponse<CreateSegmentUserResponse>,
): Promise<Response> {
  const { userId, segmentId, referrerId } = validateCreateSegmentUser(req);
  const authorizationHeader = getAuthenticationHeader(req);

  try {
    const response = await promotionsClient.createSegmentUser(
      {
        userId,
        referrerId,
        segmentId,
      },
      authorizationHeader,
    );
    return res.send(response);
  } catch (error) {
    const errorInfo = JSON.parse(error.cause.text);
    return res.status(error.status).send({ message: errorInfo.error });
  }
}

export default {
  createSegmentUser,
};
