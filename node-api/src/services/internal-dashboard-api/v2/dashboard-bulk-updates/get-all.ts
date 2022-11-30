import { Response } from 'express';
import { IDashboardApiRequest } from '../../../../typings';
import { DashboardActionLog, DashboardBulkUpdate } from '../../../../../src/models';
import { dashboardBulkUpdateSerializer, serializeMany } from '../../serializers';
import { orderBy } from 'lodash';

async function getAll(_: IDashboardApiRequest, res: Response): Promise<Response> {
  const dashboardBulkUpdates = await DashboardBulkUpdate.findAll({
    include: [DashboardActionLog],
  });

  const serializedData = await serializeMany(
    dashboardBulkUpdates,
    dashboardBulkUpdateSerializer.serializeDashboardBulkUpdate,
  );

  const data = orderBy(serializedData, ['attributes.created'], ['desc']);

  return res.send({ data });
}

export default getAll;
