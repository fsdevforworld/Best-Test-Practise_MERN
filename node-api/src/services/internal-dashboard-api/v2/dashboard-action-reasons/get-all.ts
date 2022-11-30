import { Response } from 'express';
import { IDashboardApiRequest } from '../../../../typings';
import { DashboardAction, DashboardActionReason } from '../../../../../src/models';
import { dashboardActionSerializers, serializeMany } from '../../serializers';
import { orderBy } from 'lodash';

async function getAll(_: IDashboardApiRequest, res: Response): Promise<Response> {
  const dashboardActionReasons = await DashboardActionReason.scope('active').findAll({
    include: [DashboardAction],
  });

  const serializedData = await serializeMany(
    dashboardActionReasons,
    dashboardActionSerializers.serializeDashboardActionReason,
  );

  // noteRequired is a stand-in for Other, which is always last
  const data = orderBy(
    serializedData,
    ['attributes.actionCode', 'attributes.noteRequired', 'attributes.reason'],
    ['asc', 'asc', 'asc'],
  );

  return res.send({ data });
}

export default getAll;
