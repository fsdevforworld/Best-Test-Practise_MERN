import { Moment } from '@dave-inc/time-lib';
import { HustleCategory, HustlePartner, HustleSortOrder } from '@dave-inc/wire-typings';

export type HustleSearchResult = {
  page: number;
  totalPages: number;
  hustles: Hustle[];
  message?: string;
};

export type HustleSearchCriteria = {
  keywords?: string[];
  category?: HustleCategory;
  lat?: string;
  long?: string;
  radius?: number;
  hustlePartner?: HustlePartner;
  postedDateSort?: HustleSortOrder;
  distanceSort?: HustleSortOrder;
  page?: number;
};

export type Hustle = {
  name: string;
  company: string;
  postedDate: Moment | null;
  description: string | null;
  city: string | null;
  state: string | null;
  affiliateLink: string | null;
  category: HustleCategory | null;
  externalId: string;
  hustlePartner: HustlePartner;
  isActive: boolean;
  logo: string | null;
};

export type HustleCategoryConfig = {
  name: HustleCategory;
  priority: number;
  image: string;
};

export type HustleJobPack = {
  bgColor: string;
  created: string;
  id: number;
  image: string;
  name: string;
  sortBy: string;
  sortOrder: HustleSortOrder;
  updated: string;
};
