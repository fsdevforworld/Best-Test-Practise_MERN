export type TicketForm = {
  id: number;
  ticket_field_ids: number[];
  restricted_brand_ids: number[];
};

export type TicketField = {
  id: number;
  title: string;
  type: string;
};

export type Brand = {
  id: number;
  host_mapping?: string;
  subdomain: string;
};

export type AnyZendeskResource = TicketForm | TicketField | Brand;

export type ReferenceMappingsType = {
  [key: string]: {
    fromId: number;
    toId: number;
    name: string;
  };
};
