import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum HustleMetrics {
  HUSTLE_APPCAST_GET = 'hustle.appcast.get',
  HUSTLE_APPCAST_SEARCH = 'hustle.appcast.search',
  HUSTLE_APPCAST_SEARCH_SINGLE_RETURNING_NOT_EXACTLY_ONE = 'hustle.appcast.search.single.returning_not_exactly_one',
  HUSTLE_APPCAST_GET_HUSTLE_UNKNOWN_ERROR = 'hustle.appcast.get_hustle.unknown_error',
  HUSTLE_INVALID_HUSTLE_ID = 'hustle.invalid_hustle_id',
  HUSTLE_EXTERNAL_ID_NOT_FOUND = 'hustle.external_id_not_found',
  HUSTLE_SAVE_FAILED = 'hustle.save.failed',
  HUSTLE_UNSAVE_FAILED = 'hustle.unsave.failed',
  HUSTLE_GET_SAVED_HUSTLES_FAILED = 'hustle.get_saved_hustles.failed',
}

export const metrics = wrapMetrics<HustleMetrics>();
