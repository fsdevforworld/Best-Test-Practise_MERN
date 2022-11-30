import { DashboardAction } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

interface IDashboardActionResource extends IApiResourceObject {
  attributes: {
    code: string;
    name: string;
    created: string;
    updated: string;
  };
}

const serializeDashboardAction: serialize<DashboardAction, IDashboardActionResource> = async (
  dashboardAction: DashboardAction,
) => {
  return {
    id: `${dashboardAction.id}`,
    type: `dashboard-action`,
    attributes: {
      code: dashboardAction.code,
      name: dashboardAction.name,
      created: serializeDate(dashboardAction.created),
      updated: serializeDate(dashboardAction.updated),
    },
  };
};

export { IDashboardActionResource };
export default serializeDashboardAction;
