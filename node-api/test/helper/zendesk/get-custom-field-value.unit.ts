import { expect } from 'chai';
import getCustomFieldValue from '../../../src/helper/zendesk/get-custom-field-value';
import {
  ZENDESK_CUSTOM_FIELD_ID,
  ZENDESK_USER_SUBMITTED_REASONS,
} from '../../../src/lib/zendesk/constants';
import { ZendeskTicket } from '../../../src/typings/zendesk';

const ticket: ZendeskTicket = {
  id: 123,
  requester_id: 456,
  custom_fields: [],
};

describe('Zendesk getCustomFieldValue()', () => {
  beforeEach(() => {
    ticket.custom_fields = [];
  });

  it('should return the custom field value if the custom field passed in is found', () => {
    ticket.custom_fields = [
      {
        id: ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON,
        value: ZENDESK_USER_SUBMITTED_REASONS.BORROWING_MONEY_INCORRECT_PAYBACK_DATE,
      },
    ];
    expect(getCustomFieldValue(ticket, ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON)).to.eq(
      ZENDESK_USER_SUBMITTED_REASONS.BORROWING_MONEY_INCORRECT_PAYBACK_DATE,
    );
  });

  it('should return null if the custom field passed in is not found', () => {
    ticket.custom_fields = [
      {
        id: ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON,
        value: ZENDESK_USER_SUBMITTED_REASONS.BORROWING_MONEY_INCORRECT_PAYBACK_DATE,
      },
    ];
    expect(getCustomFieldValue(ticket, ZENDESK_CUSTOM_FIELD_ID.TICKET_PRIORITY)).to.eq(null);
  });
});
