import { IApiResourceObject } from '../../../../typings';

interface INoteResource extends IApiResourceObject {
  type: 'dashboard-note';
  attributes: {
    created: string;
    internalUserEmail: string;
    note: string;
    noteType: string;
    updated: string;
    zendeskTicketUrl: string;
  };
}

export default INoteResource;
