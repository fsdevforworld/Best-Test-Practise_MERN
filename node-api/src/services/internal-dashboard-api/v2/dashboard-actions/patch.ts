import { getParams } from '../../../../lib/utils';
import { DashboardAction } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { dashboardActionSerializers } from '../../serializers';

async function patch(
  req: IDashboardApiResourceRequest<DashboardAction, { name: string }>,
  res: IDashboardV2Response<dashboardActionSerializers.IDashboardActionResource>,
) {
  const dashboardAction = req.resource;

  const { name } = getParams(req.body, ['name']);

  await dashboardAction.update({
    name,
  });

  const data = await dashboardActionSerializers.serializeDashboardAction(dashboardAction);

  return res.send({ data });
}

export default patch;
