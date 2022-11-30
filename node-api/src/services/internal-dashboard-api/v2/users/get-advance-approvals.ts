import { AdvanceApproval, DashboardAdvanceApproval, User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { serializeMany, advanceApprovalSerializers } from '../../serializers';
import {
  IAdvanceApprovalFields,
  IAdvanceApprovalResource,
} from '../../serializers/advance-approval/serialize-advance-approval';

async function getAdvanceApprovals(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<advanceApprovalSerializers.IAdvanceApprovalResource[]>,
) {
  const advanceApprovals = await AdvanceApproval.findAll({
    where: { userId: req.resource.id },
    include: [DashboardAdvanceApproval],
    order: [['created', 'DESC']],
  });

  const data = await serializeMany<IAdvanceApprovalFields, IAdvanceApprovalResource>(
    advanceApprovals,
    advanceApprovalSerializers.serializeAdvanceApproval,
  );

  const response = {
    data,
  };

  return res.send(response);
}

export default getAdvanceApprovals;
