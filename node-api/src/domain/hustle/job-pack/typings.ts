import { HustlePartner, HustleSortOrder } from '@dave-inc/wire-typings';

export type SearchTerms = {
  term: string;
  value: string;
};

export type JobPacksCreateRequestParams = {
  name: string;
  searchTerms: SearchTerms[];
  sortBy: string;
  sortOrder: HustleSortOrder;
  providers: HustlePartner[];
  image: string;
  bgColor: string;
};
