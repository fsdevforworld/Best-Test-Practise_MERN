import { User } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface IDashboardBulkUpdateUserResource extends IApiResourceObject {
  type: 'dashboard-bulk-update-user';
  attributes: {
    firstName: string;
    lastName: string;
    email: string;
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
    created: string;
    updated: string;
  };
}

const serializeDashboardBulkUpdateUser: serialize<User, IDashboardBulkUpdateUserResource> = async (
  dashboardBulkUpdateUser: User,
  relationships,
) => {
  return {
    id: `${dashboardBulkUpdateUser.id}`,
    type: `dashboard-bulk-update-user`,
    attributes: {
      firstName: dashboardBulkUpdateUser.firstName,
      lastName: dashboardBulkUpdateUser.lastName,
      email: dashboardBulkUpdateUser.email,
      addressLine1: dashboardBulkUpdateUser.addressLine1,
      city: dashboardBulkUpdateUser.city,
      state: dashboardBulkUpdateUser.state,
      zipCode: dashboardBulkUpdateUser.zipCode,
      created: serializeDate(dashboardBulkUpdateUser.created),
      updated: serializeDate(dashboardBulkUpdateUser.updated),
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IDashboardBulkUpdateUserResource };
export default serializeDashboardBulkUpdateUser;
