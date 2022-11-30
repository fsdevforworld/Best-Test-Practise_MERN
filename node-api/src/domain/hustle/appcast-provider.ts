import { JSDOM } from 'jsdom';
import * as createDOMPurify from 'dompurify';
import * as stripHtml from 'string-strip-html';
import { $enum } from 'ts-enum-util';
import { moment } from '@dave-inc/time-lib';
import { HustleCategory, HustlePartner, HustleSortOrder } from '@dave-inc/wire-typings';
import AppcastClient, { AppcastJob } from '../../lib/appcast';
import {
  APPCAST_SEARCH_FUNCTION,
  APPCAST_SEARCH_KEYWORD,
  APPCAST_SEARCH_COORDINATES,
  APPCAST_SEARCH_RADIUS,
  APPCAST_SEARCH_SORT_BY,
  APPCAST_SORT_POSTED_AT,
  APPCAST_SORT_DIRECTION_ASC,
  APPCAST_SORT_DIRECTION_DESC,
  APPCAST_SEARCH_SORT_DIRECTION,
  APPCAST_SORT_LOCATION,
  APPCAST_SEARCH_PAGE,
} from '../../lib/appcast/constants';
import { HustleSearchCriteria, HustleSearchResult, Hustle } from './types';

function mapModelToDomain(job: AppcastJob): Hustle {
  return {
    name: job.title,
    company: job.employer,
    postedDate: moment(job.posted_at),
    description: sanitizeDescription(job.body),
    affiliateLink: job.url,
    category: $enum(HustleCategory).asValueOrDefault(job.function, null),
    externalId: job.job_id,
    hustlePartner: HustlePartner.Appcast,
    isActive: true,
    city: job.location.city,
    state: job.location.state,
    logo: job.logo_url,
  };
}

function getAppcastSortDirection(hustleSearchSortOrder: HustleSortOrder): string {
  return hustleSearchSortOrder === HustleSortOrder.ASC
    ? APPCAST_SORT_DIRECTION_ASC
    : APPCAST_SORT_DIRECTION_DESC;
}

function getAppcastClientParams(searchCriteria: HustleSearchCriteria): Map<string, string> {
  const searchParams = new Map<string, string>();
  if (searchCriteria.category) {
    searchParams.set(APPCAST_SEARCH_FUNCTION, searchCriteria.category);
  }
  if (searchCriteria.keywords) {
    searchParams.set(APPCAST_SEARCH_KEYWORD, searchCriteria.keywords.join(' '));
  }
  if (searchCriteria.lat && searchCriteria.long) {
    searchParams.set(APPCAST_SEARCH_COORDINATES, `${searchCriteria.lat},${searchCriteria.long}`);
    if (searchCriteria.radius) {
      searchParams.set(APPCAST_SEARCH_RADIUS, `${searchCriteria.radius}miles`);
    }
    if (searchCriteria.distanceSort) {
      searchParams.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_LOCATION);
      searchParams.set(
        APPCAST_SEARCH_SORT_DIRECTION,
        getAppcastSortDirection(searchCriteria.distanceSort),
      );
    }
  }
  if (searchCriteria.postedDateSort) {
    searchParams.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_POSTED_AT);
    searchParams.set(
      APPCAST_SEARCH_SORT_DIRECTION,
      getAppcastSortDirection(searchCriteria.postedDateSort),
    );
  }
  if (searchCriteria.page != null) {
    searchParams.set(APPCAST_SEARCH_PAGE, `${searchCriteria.page}`);
  }
  return searchParams;
}

export async function searchHustles(
  searchCriteria: HustleSearchCriteria,
): Promise<HustleSearchResult> {
  const appcastResultPage = await AppcastClient.searchJobs(getAppcastClientParams(searchCriteria));
  return {
    totalPages: appcastResultPage.pages_total,
    page: appcastResultPage.page,
    hustles: appcastResultPage.jobs.map(mapModelToDomain),
  };
}

export async function getHustle(externalId: string): Promise<Hustle> {
  const job = await AppcastClient.searchByAppcastJobId(externalId);
  return mapModelToDomain(job);
}

export function sanitizeDescription(description: string): string {
  const { window } = new JSDOM('').window;
  // @ts-ignore
  const domPurify = createDOMPurify(window);
  const clean = domPurify.sanitize(description);
  return stripHtml(clean, { onlyStripTags: ['a'] });
}
