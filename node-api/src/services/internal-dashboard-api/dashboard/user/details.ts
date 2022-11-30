import { Response } from 'express';
import { IDashboardApiRequest } from '../../../../typings';
import { GeneralServerError, InvalidParametersError, NotFoundError } from '../../../../lib/error';
import { SupportUserView } from '../../../../models';
import fetchUserDetails from './fetch-user-details';

export default async function details(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const userId = req.params.id;
  const viewerId = req.internalUser.id;
  if (!viewerId) {
    throw new InvalidParametersError('Request missing viewerId');
  }

  let detailedUser;
  try {
    detailedUser = await fetchUserDetails(userId);
  } catch (e) {
    throw new NotFoundError(`Error fetching user details:${e.message}`);
  }

  try {
    await SupportUserView.create({ viewerId, userId });
  } catch (e) {
    throw new GeneralServerError(`Error creating SupportUserView:${e.message}`);
  }

  return res.status(200).send(detailedUser);
}
