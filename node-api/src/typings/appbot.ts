export type AppBotReview = {
  id: number;
  app_id: number;
  app_store_id: string;
  author: string;
  rating: number;
  body: string;
  subject?: string;
  published_at: string; // 2019-08-14
  version?: string;
  country: string;
  country_code: string;
  translated_subject?: string;
  translated_body?: string;
  reply_text?: string;
  reply_date?: string; // 2019-08-14
  topics?: string[];
  store_id: string;
  device?: string;
  device_friendly_name?: string;
  os_version?: string;
  os_version_friendly_name?: string;
  sentiment?: string;
  detected_language?: string;
  permalink_url: string;
  reply_url: string;
  internal_url: string;
};

export type AppBotReviewResultsPage = {
  count: number;
  page: number;
  total_count: number;
  total_pages: number;
  results: AppBotReview[];
};
