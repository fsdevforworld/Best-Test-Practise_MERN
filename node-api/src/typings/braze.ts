import { Moment } from 'moment';

export type BrazeUserAttributes = {
  externalId: string;
  [customAttribute: string]: any;
};

export type BrazeEvent = {
  externalId: string;
  name: string;
  time: Moment;
  appId?: string;
  properties?: BrazeProperties;
};

export type BrazePurchase = {
  externalId: string;
  productId: string;
  currency: BrazeCurrency.USA;
  price: number;
  time: Moment;
  quantity?: number;
  appId?: string;
  properties?: BrazeProperties;
};

// https://www.braze.com/docs/developer_guide/rest_api/user_data/#properties-object
export type BrazeProperties = {
  [prop: string]: string | number | boolean;
};

export type BrazeRecipient = {
  userAlias?: BrazeUserAlias; // User Alias of user to receive message
  externalUserId?: string; // External Id of user to receive message
  triggerProperties?: object; //personalization key-value pairs that will apply to this user (these key-value pairs will override any keys that conflict with trigger_properties above)
};

export type BrazeUpdateAttributes = {
  birthdate?: string;
  city?: string;
  country?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email_verified?: boolean;
  is_lockedout?: boolean;
  unverified_email?: string | null;
};

export type BrazeUpdateEvent = Omit<BrazeEvent, 'time' | 'externalId'>;

export type BrazeUserAlias = {
  aliasName: string;
  aliasLabel: string;
};

export type BrazeConnectedAudience = {
  AND?: BrazeConnectedAudienceFilter[] | BrazeConnectedAudience[];
  OR?: BrazeConnectedAudienceFilter[] | BrazeConnectedAudience[];
};

export type BrazeConnectedAudienceFilter = BrazeCustomAttributeFilter;

export type BrazeCustomAttributeFilter = {
  [customAttribute: string]: {
    customAttributeName: string; // the name of the custom attribute to filter on,
    comparison: string; // one of the allowed comparisons to make against the provided value,
    value: any; // (String, Numeric, Boolean) the value to be compared using the provided comparison
  };
};

export enum BrazeCurrency {
  USA = 'USD',
}
