import { wrapMetrics } from '../datadog-statsd';

export const enum AppcastMetrics {
  HUSTLE_APPCAST_FAIL = 'hustle.appcast_client.fail',
  HUSTLE_APPCAST_GET = 'hustle.appcast_client_get',
  HUSTLE_APPCAST_GET_RESPONSE_TIME = 'hustle.appcast_client_get.response_time',
  HUSTLE_APPCAST_SEARCH_JOBS_COUNT = 'hustle.appcast_client_search.jobs_count',
  HUSTLE_APPCAST_SEARCH = 'hustle.appcast_client_search',
  HUSTLE_APPCAST_SEARCH_RESPONSE_TIME = 'hustle.appcast_client_search.response_time',
  HUSTLE_APPCAST_SEARCH_SINGLE_RETURNING_NOT_EXACTLY_ONE = 'hustle.appcast_client_get.returning_not_exactly_one',
}

export const metrics = wrapMetrics<AppcastMetrics>();
