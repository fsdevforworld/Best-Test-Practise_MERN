import { DashboardAdvanceApproval } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';
import { Moment, moment } from '@dave-inc/time-lib';

interface IAdvanceApprovalResource extends IApiResourceObject {
  type: 'advance-approval';
  attributes: {
    approved: boolean;
    approvedAmounts: number[];
    defaultPaybackDate: string;
    created: string;
    initiator: 'user' | 'agent';
  };
}

export interface IAdvanceApprovalFields {
  id: number;
  approved: boolean;
  approvedAmounts: number[];
  defaultPaybackDate?: string | Moment;
  created: string | Moment;
}

const serializeAdvanceApproval: serialize<
  IAdvanceApprovalFields,
  IAdvanceApprovalResource
> = async (advanceApproval: IAdvanceApprovalFields, relationships?: IRawRelationships) => {
  const dashboardAdvanceApproval = await DashboardAdvanceApproval.findOne({
    where: { advanceApprovalId: advanceApproval.id },
  });

  const initiator = dashboardAdvanceApproval ? 'agent' : 'user';

  return {
    type: 'advance-approval',
    id: `${advanceApproval.id}`,
    attributes: {
      approved: advanceApproval.approved,
      approvedAmounts: advanceApproval.approvedAmounts || [],
      defaultPaybackDate: serializeDate(moment(advanceApproval.defaultPaybackDate), 'YYYY-MM-DD'),
      created: serializeDate(moment(advanceApproval.created)),
      initiator,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IAdvanceApprovalResource };
export default serializeAdvanceApproval;
