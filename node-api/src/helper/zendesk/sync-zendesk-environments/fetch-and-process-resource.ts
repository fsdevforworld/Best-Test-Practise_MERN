import Client from '../../../lib/zendesk/client';
import processTicketFieldsResponse from './process-ticket-fields-response';
import processBrandsResponse from './process-brands-response';
import processTicketFormsResponse from './process-ticket-forms-response';
import { TicketForm, TicketField, Brand, AnyZendeskResource } from './typings';

function processFetchedValues(
  toClient: Client,
  resource: string,
  responseValues: Array<TicketForm & TicketField & Brand>,
): Promise<AnyZendeskResource[]> | AnyZendeskResource[] {
  switch (resource) {
    case 'ticket_fields':
      return processTicketFieldsResponse(toClient, responseValues);
    case 'brands':
      return processBrandsResponse(responseValues);
    case 'ticket_forms':
      return processTicketFormsResponse(responseValues);
    default:
      return responseValues;
  }
}

export default async function fetchAndProcessResource(
  fromClient: Client,
  toClient: Client,
  resource: string,
): Promise<AnyZendeskResource[]> {
  const listResponse = await fromClient.list(resource);
  return processFetchedValues(toClient, resource, listResponse.body[resource]);
}
