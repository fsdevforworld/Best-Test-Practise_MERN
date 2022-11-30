export const APPCAST_SEARCH_KEYWORD = 'keyword';

//"and"/"or" – "and" search for all words in "keyword", "or" – for any, default – "and"
export const APPCAST_SEARCH_KEYWORD_OPERATOR = 'keyword_operator';

// generic location searches in all of 'country', 'state', 'city' and 'zip' fields
export const APPCAST_SEARCH_GENERIC_LOCATION = 'location';

// coordinates in format "latitude,longitude" to search near
export const APPCAST_SEARCH_COORDINATES = 'c';

// "City, 2LetterStateAbbrev", which is converted to coordinates
export const APPCAST_SEARCH_CITY_STATE = 'l';

// radius in Elasticsearch Distance Units, used when COORDINATES are passed
export const APPCAST_SEARCH_RADIUS = 'r';

// job function (job category), not a function in the programming sense
export const APPCAST_SEARCH_FUNCTION = 'function';

// filter by posted date ('YYYY-mm-dd' format)
export const APPCAST_SEARCH_POSTED_AT = 'posted_at';

// job_id – filter by job ID(job_reference)
export const APPCAST_SEARCH_JOB_ID = 'job_id';

// employer name
export const APPCAST_SEARCH_EMPLOYER = 'employer';

// cost per click
export const APPCAST_SEARCH_CPC = 'cpc';

// cost per application?
export const APPCAST_SEARCH_CPA = 'cpa';

// exact equality of coutry field
export const APPCAST_SEARCH_COUNTRY = 'country_term';

//exact equality of state field
export const APPCAST_SEARCH_STATE = 'state_term';

//exact equality of city field
export const APPCAST_SEARCH_CITY = 'city_term';

// max number of jobs to include in response
export const APPCAST_SEARCH_JOBS_PER_PAGE = 'jobs_per_page';

// zero indexed
export const APPCAST_SEARCH_PAGE = 'page';

// can only sort by the fields in APPCAST_SORT_FIELDS
export const APPCAST_SEARCH_SORT_BY = 'sort_by';

// can only order by the fields in APPCAST_SORT_DIRECTIONS
export const APPCAST_SEARCH_SORT_DIRECTION = 'sort_direction';

export const APPCAST_SEARCH_FIELDS = [
  APPCAST_SEARCH_KEYWORD,
  APPCAST_SEARCH_KEYWORD_OPERATOR,
  APPCAST_SEARCH_GENERIC_LOCATION,
  APPCAST_SEARCH_COORDINATES,
  APPCAST_SEARCH_CITY_STATE,
  APPCAST_SEARCH_RADIUS,
  APPCAST_SEARCH_FUNCTION,
  APPCAST_SEARCH_POSTED_AT,
  APPCAST_SEARCH_JOB_ID,
  APPCAST_SEARCH_EMPLOYER,
  APPCAST_SEARCH_CPC,
  APPCAST_SEARCH_CPA,
  APPCAST_SEARCH_COUNTRY,
  APPCAST_SEARCH_STATE,
  APPCAST_SEARCH_CITY,
  APPCAST_SEARCH_JOBS_PER_PAGE,
  APPCAST_SEARCH_PAGE,
  APPCAST_SEARCH_SORT_BY,
  APPCAST_SEARCH_SORT_DIRECTION,
];

export const APPCAST_SEARCH_LOCATION_FIELDS = [
  APPCAST_SEARCH_GENERIC_LOCATION,
  APPCAST_SEARCH_COORDINATES,
  APPCAST_SEARCH_CITY_STATE,
  APPCAST_SEARCH_COUNTRY,
  APPCAST_SEARCH_STATE,
  APPCAST_SEARCH_CITY,
];

export const APPCAST_SORT_SCORE = '_score';
export const APPCAST_SORT_JOB_ID = 'job_id';
export const APPCAST_SORT_TITLE = 'title';
export const APPCAST_SORT_BODY = 'body';
export const APPCAST_SORT_EMPLOYER_ID = 'employer_id';
export const APPCAST_SORT_JOB_GROUP_ID = 'job_group_id';
export const APPCAST_SORT_CATEGORY = 'category';
export const APPCAST_SORT_APPCAST_CATEGORY = 'appcast_category';
export const APPCAST_SORT_CITY = 'city';
export const APPCAST_SORT_EMPLOYER = 'employer';
export const APPCAST_SORT_COUNTRY = 'country';
export const APPCAST_SORT_CREATED_AT = 'created_at';
export const APPCAST_SORT_POSTED_AT = 'posted_at';
export const APPCAST_SORT_EXPIRED_AT = 'expired_at';
export const APPCAST_SORT_JOB_TYPE = 'job_type';
export const APPCAST_SORT_LOCATION = 'location';
export const APPCAST_SORT_REQ_NUMBER = 'req_number';
export const APPCAST_SORT_STATE = 'state';
export const APPCAST_SORT_URL = 'url';
export const APPCAST_SORT_CPC = 'cpc';
export const APPCAST_SORT_CPA = 'cpa';
export const APPCAST_SORT_ZIP = 'zip';

export const APPCAST_SORT_FIELDS = [
  APPCAST_SORT_SCORE,
  APPCAST_SORT_JOB_ID,
  APPCAST_SORT_TITLE,
  APPCAST_SORT_BODY,
  APPCAST_SORT_EMPLOYER_ID,
  APPCAST_SORT_JOB_GROUP_ID,
  APPCAST_SORT_CATEGORY,
  APPCAST_SORT_APPCAST_CATEGORY,
  APPCAST_SORT_CITY,
  APPCAST_SORT_EMPLOYER,
  APPCAST_SORT_COUNTRY,
  APPCAST_SORT_CREATED_AT,
  APPCAST_SORT_POSTED_AT,
  APPCAST_SORT_EXPIRED_AT,
  APPCAST_SORT_JOB_TYPE,
  APPCAST_SORT_LOCATION,
  APPCAST_SORT_REQ_NUMBER,
  APPCAST_SORT_STATE,
  APPCAST_SORT_URL,
  APPCAST_SORT_CPC,
  APPCAST_SORT_CPA,
  APPCAST_SORT_ZIP,
];

export const APPCAST_SORT_DIRECTION_ASC = 'asc';
export const APPCAST_SORT_DIRECTION_DESC = 'desc';

export const APPCAST_SORT_DIRECTIONS = [APPCAST_SORT_DIRECTION_ASC, APPCAST_SORT_DIRECTION_DESC];
