import { Event } from './events';

export type Integrations = {
  Amplitude?: boolean | { session_id?: number };
  AppsFlyer?: boolean | { appsFlyerId: string };
  Braze?: boolean;
};

export type Platform = 'android' | 'ios';

type Property = string | number | boolean;
type CustomTraits = {
  [key: string]: Property | Record<string, Property> | Property[];
};

export type Traits = CustomTraits & {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  avatar?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
};

type Context = {
  /**
   * Whether a user is active
   * This is usually used to flag an .identify() call to just update the traits but not “last seen.”
   */
  active?: boolean;
  /**
   * dictionary of information about the current application, containing name, version and build.
   * This is collected automatically from our mobile libraries when possible.
   */
  app?: {
    name: string;
    version: string;
    build: string;
  };
  /**
   * Dictionary of information about the device, containing id, advertisingId, manufacturer, model, name, type and version.
   */
  device?: {
    id?: string;
    advertisingId?: string;
    manufacturer?: string;
    model?: string;
    name?: string;
    type?: Platform;
    version?: string;
  };
  /**
   * Current user’s IP address.
   */
  ip?: string;
  /**
   * Dictionary of information about the operating system, containing name and version
   */
  os?: {
    name: string;
    version: string;
  };

  traits?: Traits;
};

type CustomProperties = {
  [key: string]: Property;
};
export type Properties = CustomProperties & {
  revenue?: number;
  revenueType?: string;
};

export type BaseTrackBody = {
  event: Event;
  context?: Context;
  integrations?: Integrations;
  properties?: Properties;
  timestamp?: string; // ISO-8601 format date string "2012-12-02T00:30:12.984Z"
};
export type AnonymousTrackBody = { anonymousId: string } & BaseTrackBody;
export type UserTrackBody = { userId: string } & BaseTrackBody;
export type TrackBody = AnonymousTrackBody | UserTrackBody;

export interface IIntegration {
  track: (body: TrackBody) => void;
}
