import { IApiResourceObject } from '../../../../typings';

interface IDashboardActionLogResource extends IApiResourceObject {
  type: 'dashboard-action-log';
  attributes: {
    reason: string;
    internalUserEmail: string;
    created: string;
    note: string;
    zendeskTicketUrl: string;
  };
}

export default IDashboardActionLogResource;
