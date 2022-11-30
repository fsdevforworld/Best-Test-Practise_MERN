import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { advanceSerializers } from '../../serializers';
import { DashboardAdvanceRepayment } from '../../../../models';
import { refresh as tivanTaskRefresh } from '../../domain/advance-repayment';
import { serializeDashboardAdvanceRepayment } from '../../serializers/advance';

async function refresh(
  req: IDashboardApiResourceRequest<DashboardAdvanceRepayment>,
  res: IDashboardV2Response<advanceSerializers.IDashboardAdvanceRepaymentResource>,
) {
  const dashboardAdvanceRepayment = req.resource;

  await tivanTaskRefresh(dashboardAdvanceRepayment);

  await dashboardAdvanceRepayment.reload();

  const data = await serializeDashboardAdvanceRepayment(dashboardAdvanceRepayment);

  const response = {
    data,
  };

  return res.send(response);
}

export default refresh;
