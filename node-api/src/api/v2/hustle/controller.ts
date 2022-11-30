import {
  HustleCategory,
  HustlePartner,
  HustleResponse,
  HustleSortOrder,
  HustleSearchResponse,
  HustleSummaryResponse,
  HustleCategoryResponse,
  HustleJobPackResponse,
} from '@dave-inc/wire-typings';
import { $enum } from 'ts-enum-util';
import * as HustleService from '../../../domain/hustle';
import {
  createHustleId,
  Hustle,
  HustleSearchCriteria,
  mapHustleToHustleSummaryResponse,
  mapHustleCategoryConfigToHustleCategoryResponse,
  mapJobPacksToHustleJobPackResponse,
} from '../../../domain/hustle';
import { getParams } from '../../../lib/utils';
import { InvalidParametersError } from '../../../lib/error';
import { IDaveRequest } from '../../../typings/dave-request-response';

const INVALID_HUSTLE_SEARCH_OPTIONS_ERROR = 'Invalid Hustle Search Options.';
const MISSING_HUSTLE_SEARCH_PARAMETERS_ERROR = 'At least one Hustle Search Option is required.';

function mapHustleToHustleResponse(hustle: Hustle): HustleResponse {
  return {
    affiliateLink: hustle.affiliateLink,
    category: hustle.category,
    city: hustle.city,
    company: hustle.company,
    description: hustle.description,
    hustleId: createHustleId(hustle),
    logo: hustle.logo,
    name: hustle.name,
    postedDate: hustle.postedDate?.format('YYYY-MM-DD') || null,
    state: hustle.state,
  };
}

function validateSortDirection(sortDirection: string): void {
  const sortOrder = $enum(HustleSortOrder).asValueOrDefault(sortDirection, null);
  if (!sortOrder || !(sortOrder === HustleSortOrder.ASC || sortOrder === HustleSortOrder.DESC)) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
}

function validateCategory(categoryString: string): void {
  const category = $enum(HustleCategory).asValueOrDefault(categoryString, null);
  if (!category) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
}

function validatePartner(partnerString: string): void {
  const partner = $enum(HustlePartner).asValueOrDefault(partnerString, null);
  if (!partner) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
}

function validateLocation(lat: string, long: string, radius: string): void {
  if (!lat || !long) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
  const latLongMatcher = RegExp(/^[-]?[0-9]+([.][0-9]+)?$/);
  if (!(latLongMatcher.test(lat) && latLongMatcher.test(long))) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
  if (radius) {
    const radiusValue = parseInt(radius, 10);
    if (!radiusValue || radiusValue < 0) {
      throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
    }
  }
}

function validatePageParam(pageParam: string): void {
  const pageValue = parseInt(pageParam, 10);
  if (pageValue == null || isNaN(pageValue) || pageValue < 0) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
}

function validateSearchCriteria(searchCriteria: HustleSearchCriteria): void {
  if (
    !searchCriteria.keywords &&
    !searchCriteria.category &&
    !searchCriteria.hustlePartner &&
    !(searchCriteria.lat && searchCriteria.long)
  ) {
    throw new InvalidParametersError(MISSING_HUSTLE_SEARCH_PARAMETERS_ERROR);
  }
  if (searchCriteria.distanceSort && searchCriteria.postedDateSort) {
    throw new InvalidParametersError(INVALID_HUSTLE_SEARCH_OPTIONS_ERROR);
  }
}

function getSearchCriteria(req: IDaveRequest): HustleSearchCriteria {
  const searchOptions: HustleSearchCriteria = {};
  if (req.query.keyword) {
    searchOptions.keywords = req.query.keyword.replace(/%20/g, ' ').split(/[+\s]+/);
  }
  if (req.query.category) {
    const categoryString = req.query.category.replace(/(%20|[+])/g, ' ');
    validateCategory(categoryString);
    searchOptions.category = categoryString;
  }
  if (req.query.lat || req.query.long || req.query.radius || req.query.distance_sort) {
    validateLocation(req.query.lat, req.query.long, req.query.radius);
    searchOptions.lat = req.query.lat;
    searchOptions.long = req.query.long;
    if (req.query.radius) {
      searchOptions.radius = parseInt(req.query.radius, 10);
    }
    if (req.query.distance_sort) {
      validateSortDirection(req.query.distance_sort);
      searchOptions.distanceSort = req.query.distance_sort;
    }
  }
  if (req.query.partner) {
    validatePartner(req.query.partner);
    searchOptions.hustlePartner = req.query.partner;
  }
  if (req.query.posted_date_sort) {
    validateSortDirection(req.query.posted_date_sort);
    searchOptions.postedDateSort = req.query.posted_date_sort;
  }
  if (req.query.page) {
    validatePageParam(req.query.page);
    searchOptions.page = parseInt(req.query.page, 10);
  }
  return searchOptions;
}

export async function get(req: IDaveRequest): Promise<HustleResponse> {
  const { hustleId } = getParams(req.params, ['hustleId']);
  const hustle = await HustleService.getHustle(hustleId);
  return mapHustleToHustleResponse(hustle);
}

export async function search(req: IDaveRequest): Promise<HustleSearchResponse> {
  const searchCriteria = getSearchCriteria(req);
  validateSearchCriteria(searchCriteria);
  const searchResult = await HustleService.searchHustles(searchCriteria);
  const response = {
    page: searchResult.page,
    totalPages: searchResult.totalPages,
    hustles: searchResult.hustles.map(mapHustleToHustleSummaryResponse),
  };
  return searchResult.message ? { message: searchResult.message, ...response } : response;
}

export async function saveHustle(req: IDaveRequest): Promise<HustleSummaryResponse[]> {
  const { jobId } = getParams(req.body, ['jobId']);
  const hustles = await HustleService.saveHustle(req.user.id, jobId);
  return hustles.map(mapHustleToHustleSummaryResponse);
}

export async function unsaveHustle(req: IDaveRequest): Promise<HustleSummaryResponse[]> {
  const hustles = await HustleService.unsaveHustle(req.user.id, req.params.hustleId);
  return hustles.map(mapHustleToHustleSummaryResponse);
}

export async function getSavedHustles(req: IDaveRequest): Promise<HustleSummaryResponse[]> {
  const hustles = await HustleService.getSavedHustles(req.user.id);
  return hustles.map(mapHustleToHustleSummaryResponse);
}

export async function getCategories(): Promise<HustleCategoryResponse[]> {
  const categories = await HustleService.getCategories();
  return categories.map(mapHustleCategoryConfigToHustleCategoryResponse);
}

export async function getJobPacks(): Promise<HustleJobPackResponse[]> {
  const jobPacks = await HustleService.getJobPacks();
  return jobPacks.map(mapJobPacksToHustleJobPackResponse);
}
