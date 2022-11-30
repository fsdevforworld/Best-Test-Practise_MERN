import { sortedUniqBy } from 'lodash';
import { IDaveRequest } from '../../typings';
import { Response } from 'express';
import { Incident, User } from '../../models';

async function get(req: IDaveRequest, res: Response): Promise<Response> {
  const [publicIncidents, userSpecificIncidents] = await Promise.all([
    Incident.scope(['active', 'public']).findAll(),
    Incident.scope(['active', 'private']).findAll({
      include: [
        {
          model: User,
          where: { id: req.user.id },
          as: 'users',
          required: true,
          attributes: [],
        },
      ],
    }),
  ]);

  const allIncidents = publicIncidents
    .concat(userSpecificIncidents)
    .sort((incidentA, incidentB) => incidentA.id - incidentB.id);

  return res.send({ incidents: sortedUniqBy(allIncidents, incident => incident.id) });
}

export default {
  get,
};
