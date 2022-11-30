import { ZendeskTicket } from '../../typings';

export default function getCustomFieldValue(zTicket: ZendeskTicket, customFieldID: number) {
  const customFieldData = zTicket.custom_fields.find(
    customField => customField.id === customFieldID,
  );
  return customFieldData ? customFieldData.value : null;
}
