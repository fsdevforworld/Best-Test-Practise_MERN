import * as request from 'superagent';
import { isEmpty } from 'lodash';
import { ISuperAgentAgent } from '../../typings';
import { AppcastJob, AppcastResultPage } from './types';
import * as querystring from 'querystring';
import { APPCAST_SEARCH_JOB_ID } from './constants';
import { metrics, AppcastMetrics as Metrics } from './metrics';
import { AppcastInvalidJobIdError, AppcastResponseError, gatewayService } from '../error';
import { SideHustleErrorKey } from '../../translations';
import logger from '../logger';

const failingService = 'appcast';
export default class AppcastClient {
  public agent: ISuperAgentAgent<request.SuperAgentRequest>;
  private baseUrl: string;
  private apiKey: string;

  constructor({ apiKey, baseUrl }: { apiKey: string; baseUrl: string }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.agent = (request.agent() as ISuperAgentAgent<request.SuperAgentRequest>).set(
      'x-api-key',
      this.apiKey,
    );
  }

  public async searchByAppcastJobId(jobId: string): Promise<AppcastJob> {
    const paramMap = new Map<string, string>();
    paramMap.set(APPCAST_SEARCH_JOB_ID, jobId);
    const { jobs } = await this.doAppcastQuery(
      paramMap,
      Metrics.HUSTLE_APPCAST_GET,
      Metrics.HUSTLE_APPCAST_GET_RESPONSE_TIME,
    );
    if (jobs.length !== 1) {
      const msg = isEmpty(jobs)
        ? 'Appcast job not found'
        : 'Appcast returned too many results for single job';
      const payload = isEmpty(jobs) ? { externalId: jobId } : { externalId: jobId, jobs };
      logger.error(msg, { ...payload });
      metrics.increment(Metrics.HUSTLE_APPCAST_SEARCH_SINGLE_RETURNING_NOT_EXACTLY_ONE);
      throw new AppcastInvalidJobIdError(msg);
    }
    return jobs[0];
  }

  // TODO I think we can delete this and all it's usages.
  public async legacySearchJobs(searchParams: Map<string, string>): Promise<AppcastJob[]> {
    const { jobs } = await this.searchJobs(searchParams);
    return jobs;
  }

  public async searchJobs(searchParams: Map<string, string>): Promise<AppcastResultPage> {
    return await this.doAppcastQuery(
      searchParams,
      Metrics.HUSTLE_APPCAST_SEARCH,
      Metrics.HUSTLE_APPCAST_SEARCH_RESPONSE_TIME,
      Metrics.HUSTLE_APPCAST_SEARCH_JOBS_COUNT,
    );
  }

  private async doAppcastQuery(
    params: Map<string, string>,
    countMetric: Metrics,
    timeMetric: Metrics,
    jobsCountMetric?: Metrics,
  ): Promise<AppcastResultPage> {
    const queryObj: any = {};
    for (const [key, value] of params) {
      queryObj[key] = value;
    }
    const searchUrl = `${this.baseUrl}/search`;
    const url = `${searchUrl}?${querystring.stringify(queryObj)}`;
    let jobResp: request.Response;
    const startTime = new Date().getTime();
    try {
      jobResp = await this.agent.post(url).send();
    } catch (error) {
      metrics.increment(Metrics.HUSTLE_APPCAST_FAIL);
      logger.error('Failed to successfully call Appcast', { error, url, queryObj });
      throw new AppcastResponseError(SideHustleErrorKey.AppcastDown, {
        gatewayService,
        failingService,
      });
    }
    const elapsedMillis = new Date().getTime() - startTime;
    const responseCodeTag = {
      responseCode: `${jobResp.status}`,
    };
    metrics.increment(countMetric, responseCodeTag);
    metrics.histogram(timeMetric, elapsedMillis, responseCodeTag);

    if (jobsCountMetric) {
      const returnedJobCount: number = jobResp.body?.jobs_count;
      if (returnedJobCount) {
        metrics.increment(jobsCountMetric, returnedJobCount);
      }
    }
    return jobResp.body;
  }
}
