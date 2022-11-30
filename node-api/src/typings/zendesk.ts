// Format Reference: https://developer.zendesk.com/rest_api/docs/support/users#json-format-for-agent-or-admin-requests
export type ZendeskUser = {
  id?: number;
  name: string;
  email?: string;
  external_id?: string;
  user_fields?: {
    [key: string]: string | number;
  };
};

// Format Reference: https://developer.zendesk.com/rest_api/docs/support/tickets#json-format
export type ZendeskTicket = {
  id: number;
  requester_id: number;
  created_at?: string;
  tags?: string[];
  custom_fields?: ZendeskTicketCustomField[];
};

// Format Reference: https://developer.zendesk.com/rest_api/docs/support/tickets#setting-custom-field-values
export type ZendeskTicketCustomField = {
  id: number;
  value: number | string;
};

// Format Reference: https://developer.zendesk.com/rest_api/docs/help_center/articles#json-format
export type ZendeskGuideArticle = {
  id: number;
  name: string;
  section_id: number;
  label_names: string[];
  body: string;
};

// Format Reference: https://developer.zendesk.com/rest_api/docs/help_center/sections#json-format
export type ZendeskGuideSection = {
  id: number;
  name: string;
  description: string;
};
