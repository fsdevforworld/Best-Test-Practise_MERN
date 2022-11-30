import Client from '../../../lib/zendesk/client';
import referenceMappings from './reference-mappings';
import { TicketField } from './typings';

const acceptedTypes = [
  'checkbox',
  'partialcreditcard',
  'partial_credit_card',
  'date',
  'decimal',
  'integer',
  'regexp',
  'text',
  'textarea',
  'tagger',
  'multiselect',
];

function getMatchingToTicketFieldByTitle(
  toTicketFields: TicketField[],
  fromTicketFieldTitle: string,
): TicketField {
  return toTicketFields.find(toTicketField => toTicketField.title === fromTicketFieldTitle);
}

async function recordSystemTicketFields(
  ticketFields: TicketField[],
  toClient: Client,
): Promise<void> {
  const toTicketFieldsResponse = await toClient.list('ticket_fields');

  ticketFields
    .filter(ticketField => !acceptedTypes.includes(ticketField.type))
    .forEach((systemTicketField: TicketField) => {
      // Get the from Ticket field id by comparing the title
      const toMatchingTicketField = getMatchingToTicketFieldByTitle(
        toTicketFieldsResponse.body.ticket_fields,
        systemTicketField.title,
      );

      referenceMappings.add({
        resource: 'ticket_fields',
        fromId: systemTicketField.id,
        toId: toMatchingTicketField.id,
        name: systemTicketField.title,
      });
    });
}

export default async function processTicketFieldsResponse(
  toClient: Client,
  ticketFields: TicketField[],
): Promise<TicketField[]> {
  // Keep track of the ids for system ticket fields
  await recordSystemTicketFields(ticketFields, toClient);

  // Zendesk API will only create ticket fields with specific types
  return ticketFields.filter(ticketField => acceptedTypes.includes(ticketField.type));
}
