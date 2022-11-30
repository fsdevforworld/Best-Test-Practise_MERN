export type AppcastResultPage = {
  pages_total: number;
  jobs_count: number;
  page: number;
  jobs: AppcastJob[];
};

export type AppcastJob = {
  title: string;
  subject: string;
  employer: string;
  body: string;
  posted_at: string;
  url: string;
  job_id: string;
  advertiser_id: string;
  function: string;
  logo_url: string;
  cpa: number;
  cpc: number;
  location: {
    country: string;
    state: string;
    city: string;
    zip: string;
  };
  search_position: number;
};
