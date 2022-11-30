import { getParams } from '../../../../lib/utils';
import { DashboardActionReason } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { dashboardActionSerializers } from '../../serializers';

type PatchDashboardActionReasonPayload = Pick<
  DashboardActionReason,
  'reason' | 'isActive' | 'noteRequired'
>;

async function patch(
  req: IDashboardApiResourceRequest<DashboardActionReason, PatchDashboardActionReasonPayload>,
  res: IDashboardV2Response<dashboardActionSerializers.IDashboardActionReasonResource>,
) {
  const dashboardActionReason = req.resource;

  const payload = getParams(req.body, [], ['isActive', 'reason', 'noteRequired']);

  await dashboardActionReason.update(payload);

  const data = await dashboardActionSerializers.serializeDashboardActionReason(
    dashboardActionReason,
  );

  return res.send({ data });
}

export default patch;
