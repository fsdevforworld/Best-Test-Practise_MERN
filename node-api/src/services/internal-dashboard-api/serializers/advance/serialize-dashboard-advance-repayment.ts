import { DashboardAdvanceRepayment } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';
import serializeRelationships from '../serialize-relationships';

interface IDashboardAdvanceRepaymentResource extends IApiResourceObject {
  type: 'dashboard-advance-repayment';
  attributes: {
    status: DashboardAdvanceRepayment['status'];
  };
}

const serializer: serialize<
  DashboardAdvanceRepayment,
  IDashboardAdvanceRepaymentResource
> = async function serializeDashboardAdvanceRepayment(dashboardAdvanceRepayment, relationships) {
  const { tivanTaskId, status, advanceId } = dashboardAdvanceRepayment;

  return {
    id: tivanTaskId,
    type: 'dashboard-advance-repayment',
    attributes: {
      status,
    },
    relationships: {
      advance: { data: { id: `${advanceId}`, type: 'advance' } },
      ...serializeRelationships(relationships),
    },
  };
};

export { IDashboardAdvanceRepaymentResource };
export default serializer;
