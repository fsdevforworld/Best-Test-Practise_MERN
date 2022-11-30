type Property = string | number | boolean;
export type Properties = {
  [key: string]: Property | Record<string, Property> | Property[];
};

export type EventData = {
  eventType: string;
  userId?: string | number;
  insertId?: string;
  deviceId?: string;
  sessionId?: number; // unix timestamp in ms
  eventProperties?: Properties;
  userProperties?: Properties;
  appVersion?: string;
  osName?: string;
  deviceBrand?: string;
  deviceManufacturer?: string;
  deviceModel?: string;
  deviceType?: string;
  locationLat?: string;
  locationLng?: string;
  time?: string;
  revenue?: number;
  revenueType?: string;
};
