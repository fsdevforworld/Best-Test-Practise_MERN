import referenceMappings from './reference-mappings';
import { TicketForm } from './typings';

function getNewTicketFieldIds(ticketForm: TicketForm): number[] {
  // Add the new ticket_field id's to the ticket form
  const fromToReferences = referenceMappings.get();
  return ticketForm.ticket_field_ids.map(
    fromFieldId => fromToReferences.ticket_fields[fromFieldId].toId,
  );
}

function getNewBrandIds(ticketForm: TicketForm): number[] {
  // Add the new brand id's to the ticket form
  const fromToReferences = referenceMappings.get();
  return ticketForm.restricted_brand_ids.map(
    fromBrandId => fromToReferences.brands[fromBrandId].toId,
  );
}

export default async function processTicketFormsResponse(
  ticketForms: TicketForm[],
): Promise<TicketForm[]> {
  return ticketForms.map((ticketForm: TicketForm) => ({
    ...ticketForm,
    ticket_field_ids: getNewTicketFieldIds(ticketForm),
    restricted_brand_ids: getNewBrandIds(ticketForm),
  }));
}
