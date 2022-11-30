import {
  APPCAST_SEARCH_FIELDS,
  APPCAST_SEARCH_CITY_STATE,
  APPCAST_SEARCH_LOCATION_FIELDS,
  APPCAST_SEARCH_SORT_BY,
  APPCAST_SEARCH_SORT_DIRECTION,
  APPCAST_SORT_FIELDS,
  APPCAST_SORT_DIRECTIONS,
  APPCAST_SEARCH_CPA,
  APPCAST_SEARCH_CPC,
  APPCAST_SORT_DIRECTION_ASC,
  APPCAST_SORT_DIRECTION_DESC,
} from '../../../../lib/appcast/constants';
import { SIDE_HUSTLE_SORT_FIELDS } from './constants';
import { InvalidParametersError } from '../../../../lib/error';
import { User } from '../../../../models';
import * as config from 'config';

const APPCAST_SEARCH_DEFAULTS = config.get<string>('appcast.defaultSearchValues');
const APPCAST_SEARCH_FIELDS_STRING = APPCAST_SEARCH_FIELDS.join(', ');

export function validateDaveSortBy(sortBy: string) {
  if (!SIDE_HUSTLE_SORT_FIELDS.includes(sortBy)) {
    throw new InvalidParametersError(
      `${sortBy} is invalid for sorting Dave side hustles, only the following parameters are valid: ${SIDE_HUSTLE_SORT_FIELDS}`,
    );
  }
}

export function validateParams(searchParams: Map<string, string>, user: User): Map<string, string> {
  return applyDefaultSearchParams(validateAppcastSearchParams(searchParams), user);
}

function validateAppcastSearchParams(searchParams: Map<string, string>): Map<string, string> {
  // copy the lowercase value of all the search keys and values into a new map and return the new lowercase map
  const lowerCasedParams: Map<string, string> = new Map<string, string>();
  for (const [searchTerm, value] of searchParams) {
    const lowerCaseTerm = searchTerm.toLowerCase();
    if (!APPCAST_SEARCH_FIELDS.includes(lowerCaseTerm)) {
      throw new InvalidParametersError(
        `${searchTerm} is an invalid search parameter, only the following parameters are valid: ${APPCAST_SEARCH_FIELDS_STRING}`,
      );
    }
    const trimmedLowerVal = value.trim().toLowerCase();
    if (!trimmedLowerVal) {
      continue;
    }
    lowerCasedParams.set(lowerCaseTerm, trimmedLowerVal);
  }

  const sortBy = lowerCasedParams.get(APPCAST_SEARCH_SORT_BY);
  if (sortBy) {
    if (!APPCAST_SORT_FIELDS.includes(sortBy)) {
      throw new InvalidParametersError(
        `${sortBy} is invalid for ${APPCAST_SEARCH_SORT_BY}, only the following parameters are valid: ${APPCAST_SEARCH_FIELDS_STRING}`,
      );
    }
  }
  const searchDir = lowerCasedParams.get(APPCAST_SEARCH_SORT_DIRECTION);
  if (searchDir) {
    if (!APPCAST_SORT_DIRECTIONS.includes(searchDir)) {
      throw new InvalidParametersError(
        `${searchDir} is invalid for ${APPCAST_SEARCH_SORT_DIRECTION}, only the following parameters are valid: ${APPCAST_SEARCH_FIELDS_STRING}`,
      );
    }
  }
  return lowerCasedParams;
}

function applyDefaultSearchParams(
  searchParams: Map<string, string>,
  user: User,
): Map<string, string> {
  // does this query contain some location indicator?
  let containsLocation: boolean = false;
  for (const searchTerm of searchParams.keys()) {
    if (APPCAST_SEARCH_LOCATION_FIELDS.includes(searchTerm)) {
      containsLocation = true;
      break;
    }
  }
  // if the search has no location, attempt default to the user's city and state
  if (!containsLocation) {
    if (user.city && user.state) {
      searchParams.set(APPCAST_SEARCH_CITY_STATE, `${user.city}, ${user.state}`);
    }
  }

  // default other params from config if not set
  for (const [param, value] of Object.entries(APPCAST_SEARCH_DEFAULTS)) {
    if (!searchParams.has(param)) {
      searchParams.set(param, value);
    }
  }

  // default sort order:
  // if no sort column specified, sort by 'cpa' order 'desc'
  // if sort column is specified but not order, sort by specificed column and order 'asc' unless sorting by cpa or cpc
  // if both sort column and order are specified, use them
  if (!searchParams.get(APPCAST_SEARCH_SORT_BY)) {
    searchParams.set(APPCAST_SEARCH_SORT_BY, APPCAST_SEARCH_CPA);
    searchParams.set(APPCAST_SEARCH_SORT_DIRECTION, APPCAST_SORT_DIRECTION_DESC);
  } else if (!searchParams.get(APPCAST_SEARCH_SORT_DIRECTION)) {
    searchParams.set(
      APPCAST_SEARCH_SORT_DIRECTION,
      ![APPCAST_SEARCH_CPA, APPCAST_SEARCH_CPC].includes(searchParams.get(APPCAST_SEARCH_SORT_BY))
        ? APPCAST_SORT_DIRECTION_ASC
        : APPCAST_SORT_DIRECTION_DESC,
    );
  }
  return searchParams;
}
