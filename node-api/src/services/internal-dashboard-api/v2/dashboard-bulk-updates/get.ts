import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { DashboardBulkUpdate } from '../../../../models';
import { dashboardBulkUpdateSerializer } from '../../serializers';

async function get(
  req: IDashboardApiResourceRequest<DashboardBulkUpdate>,
  res: IDashboardV2Response<dashboardBulkUpdateSerializer.IDashboardBulkUpdateResource>,
) {
  const dashboardBulkUpdate = req.resource;

  const data = await dashboardBulkUpdateSerializer.serializeDashboardBulkUpdate(
    dashboardBulkUpdate,
  );

  const response = {
    data,
  };

  return res.send(response);
}

export default get;
