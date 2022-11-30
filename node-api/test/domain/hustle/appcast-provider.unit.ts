import { moment } from '@dave-inc/time-lib';
import { HustleCategory, HustlePartner, HustleSortOrder } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Hustle, HustleSearchCriteria } from '../../../src/domain/hustle';
import * as AppcastProvider from '../../../src/domain/hustle/appcast-provider';
import AppcastClient, { AppcastJob } from '../../../src/lib/appcast';
import { AppcastInvalidJobIdError } from '../../../src/lib/error';
import {
  APPCAST_SEARCH_FUNCTION,
  APPCAST_SEARCH_KEYWORD,
  APPCAST_SEARCH_COORDINATES,
  APPCAST_SEARCH_JOBS_PER_PAGE,
  APPCAST_SEARCH_RADIUS,
  APPCAST_SEARCH_SORT_BY,
  APPCAST_SORT_LOCATION,
  APPCAST_SORT_POSTED_AT,
  APPCAST_SEARCH_SORT_DIRECTION,
  APPCAST_SORT_DIRECTION_ASC,
  APPCAST_SORT_DIRECTION_DESC,
  APPCAST_SEARCH_PAGE,
} from '../../../src/lib/appcast/constants';
import { AppcastResultPage } from '../../../src/lib/appcast/types';

describe('Appcast Provider', () => {
  const sandbox = sinon.createSandbox();
  const emptyResult: AppcastResultPage = {
    page: 0,
    jobs_count: 0,
    jobs: [],
    pages_total: 0,
  };

  before(() => sandbox.restore());
  afterEach(() => sandbox.restore());

  describe('searchHustles', () => {
    it('Should return empty results if there were no results.', async () => {
      sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const hustleSearchResult = await AppcastProvider.searchHustles({});
      expect(hustleSearchResult.hustles).to.be.empty;
      expect(hustleSearchResult.page).to.equal(0);
      expect(hustleSearchResult.totalPages).to.equal(0);
    });

    it('Should return AppcastJobs with null category if function is missing', async () => {
      const appcastJob: AppcastJob = {
        job_id: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        title: 'Amazon Shopper',
        subject: 'some subject', // required field according to AppcastJob type but not in the sample response, optional?
        advertiser_id: 'some ad id', //same ^
        location: {
          country: 'United States',
          state: 'CA',
          city: 'Los Angeles',
          zip: '90066',
        },
        logo_url: 'fakeLogoUrl',
        body:
          '<table class="htmlDetailElementTable" border="0" cellpadding="0" cellspacing="0">\n<tr><td><div class="sfdc_richtext" id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver',
        url:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        employer: 'Amazon Workforce Staffing',
        posted_at: '2020-05-08T00:00:00Z',
        cpc: 0.23,
        cpa: 9.0,
        search_position: 13,
        function: null,
      };
      sandbox
        .stub(AppcastClient, 'searchJobs')
        .resolves({ page: 0, pages_total: 1, jobs_count: 1, jobs: [appcastJob] });

      const expectedHustle: Hustle = {
        name: 'Amazon Shopper',
        company: 'Amazon Workforce Staffing',
        postedDate: moment('2020-05-08T00:00:00Z'),
        description:
          '<table cellspacing="0" cellpadding="0" border="0" class="htmlDetailElementTable">\n<tbody><tr><td><div id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div" class="sfdc_richtext">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver</span></span></span></div></td></tr></tbody></table>',
        city: 'Los Angeles',
        state: 'CA',
        affiliateLink:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        category: null,
        externalId: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        isActive: true,
        hustlePartner: HustlePartner.Appcast,
        logo: appcastJob.logo_url,
      };

      const hustleSearchResult = await AppcastProvider.searchHustles({});
      expect(hustleSearchResult.hustles).to.deep.equal([expectedHustle]);
      expect(hustleSearchResult.page).to.equal(0);
      expect(hustleSearchResult.totalPages).to.equal(1);
    });

    it('should return AppcastJobs with null category if function is random string', async () => {
      const appcastJob: AppcastJob = {
        job_id: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        title: 'Amazon Shopper',
        subject: 'some subject', // required field according to AppcastJob type but not in the sample response, optional?
        advertiser_id: 'some ad id', //same ^
        location: {
          country: 'United States',
          state: 'CA',
          city: 'Los Angeles',
          zip: '90066',
        },
        logo_url: 'fakeLogoUrl',
        body:
          '<table class="htmlDetailElementTable" border="0" cellpadding="0" cellspacing="0">\n<tr><td><div class="sfdc_richtext" id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver',
        url:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        employer: 'Amazon Workforce Staffing',
        function: 'gobbledygook',
        posted_at: '2020-05-08T00:00:00Z',
        cpc: 0.23,
        cpa: 9.0,
        search_position: 13,
      };
      sandbox
        .stub(AppcastClient, 'searchJobs')
        .resolves({ page: 0, pages_total: 1, jobs_count: 1, jobs: [appcastJob] });

      const expectedHustle: Hustle = {
        name: 'Amazon Shopper',
        company: 'Amazon Workforce Staffing',
        postedDate: moment('2020-05-08T00:00:00Z'),
        description:
          '<table cellspacing="0" cellpadding="0" border="0" class="htmlDetailElementTable">\n<tbody><tr><td><div id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div" class="sfdc_richtext">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver</span></span></span></div></td></tr></tbody></table>',
        city: 'Los Angeles',
        state: 'CA',
        affiliateLink:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        category: null,
        externalId: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        isActive: true,
        hustlePartner: HustlePartner.Appcast,
        logo: appcastJob.logo_url,
      };

      const hustleSearchResult = await AppcastProvider.searchHustles({});
      expect(hustleSearchResult.hustles).to.deep.equal([expectedHustle]);
      expect(hustleSearchResult.page).to.equal(0);
      expect(hustleSearchResult.totalPages).to.equals(1);
    });

    it('should return AppcastJobs as Hustle[]', async () => {
      const appcastJob: AppcastJob = {
        job_id: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        title: 'Amazon Shopper',
        subject: 'some subject', // required field according to AppcastJob type but not in the sample response, optional?
        advertiser_id: 'some ad id', //same ^
        location: {
          country: 'United States',
          state: 'CA',
          city: 'Los Angeles',
          zip: '90066',
        },
        logo_url: 'fakeLogoUrl',
        body:
          '<table class="htmlDetailElementTable" border="0" cellpadding="0" cellspacing="0">\n<tr><td><div class="sfdc_richtext" id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver',
        url:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        employer: 'Amazon Workforce Staffing',
        function: 'Customer Service',
        posted_at: '2020-05-08T00:00:00Z',
        cpc: 0.23,
        cpa: 9.0,
        search_position: 13,
      };
      sandbox
        .stub(AppcastClient, 'searchJobs')
        .resolves({ page: 0, pages_total: 1, jobs_count: 1, jobs: [appcastJob] });

      const expectedHustle: Hustle = {
        name: 'Amazon Shopper',
        company: 'Amazon Workforce Staffing',
        postedDate: moment('2020-05-08T00:00:00Z'),
        description:
          '<table cellspacing="0" cellpadding="0" border="0" class="htmlDetailElementTable">\n<tbody><tr><td><div id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div" class="sfdc_richtext">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver</span></span></span></div></td></tr></tbody></table>',
        city: 'Los Angeles',
        state: 'CA',
        affiliateLink:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        category: HustleCategory.CUSTOMER_SERVICE,
        externalId: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        isActive: true,
        hustlePartner: HustlePartner.Appcast,
        logo: appcastJob.logo_url,
      };

      const hustleSearchResult = await AppcastProvider.searchHustles({});
      expect(hustleSearchResult.hustles).to.deep.equal([expectedHustle]);
      expect(hustleSearchResult.page).to.equal(0);
      expect(hustleSearchResult.totalPages).to.equals(1);
    });
  });

  describe('search criteria are interpolated correctly', () => {
    it('search criteria with category calls appcast client with function param', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const expectedParams: Map<string, string> = new Map();
      expectedParams.set(APPCAST_SEARCH_FUNCTION, 'Science');
      const testSearchCriteria: HustleSearchCriteria = {
        category: HustleCategory.SCIENCE,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      expect(
        appcastClientStub.lastCall.args,
        'Category arg passed to appcast client should match expected.',
      ).to.deep.equals([expectedParams]);
    });

    it('search criteria with keyword calls appcast client with keyword param', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const expectedParams: Map<string, string> = new Map();
      expectedParams.set(APPCAST_SEARCH_KEYWORD, 'cat dog');
      const testSearchCriteria: HustleSearchCriteria = {
        keywords: ['cat', 'dog'],
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      expect(
        appcastClientStub.lastCall.args,
        'Keyword args passed to appcast client should match expected.',
      ).to.deep.equals([expectedParams]);
    });

    it('search criteria with location calls appcast client with c param', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const expectedParams: Map<string, string> = new Map();
      expectedParams.set(APPCAST_SEARCH_COORDINATES, '34.052,-118.243'); // los angeles.
      const testSearchCriteria: HustleSearchCriteria = {
        lat: '34.052',
        long: '-118.243',
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      expect(
        appcastClientStub.lastCall.args,
        'Coordinate args passed to appcast client should match expected.',
      ).to.deep.equals([expectedParams]);
    });

    it('search criteria with radius calls appcast with r param', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const testSearchCriteria: HustleSearchCriteria = {
        lat: '34.052',
        long: '-118.243',
        radius: 90,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      const appcastClientStubArgs = appcastClientStub.lastCall.args;
      expect(appcastClientStubArgs.length).to.equal(1);
      const appcastClientArgs: Map<string, string> = appcastClientStubArgs[0];
      expect(appcastClientArgs.has(APPCAST_SEARCH_RADIUS), 'Map should contain radius param').to.be
        .true;
      expect(
        appcastClientArgs.get(APPCAST_SEARCH_RADIUS),
        'Radius param should have correct value',
      ).to.equal('90miles');
    });

    it('radius in search criteria is ingored if coordinates not provided', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const testSearchCriteria: HustleSearchCriteria = {
        keywords: ['zomg'],
        radius: 55,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      const appcastClientStubArgs = appcastClientStub.lastCall.args;
      expect(appcastClientStubArgs.length).to.equal(1);
      const appcastClientArgs: Map<string, string> = appcastClientStubArgs[0];
      expect(appcastClientArgs.has(APPCAST_SEARCH_RADIUS), 'Map should not contain radius param').to
        .be.false;
    });

    it('sorting by posted date calls appcast with sort option and direction', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const testSearchCriteria: HustleSearchCriteria = {
        keywords: ['clever', 'girl'],
        postedDateSort: HustleSortOrder.DESC,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      const appcastClientStubArgs = appcastClientStub.lastCall.args;
      expect(appcastClientStubArgs.length).to.equal(1);
      const appcastClientArgs: Map<string, string> = appcastClientStubArgs[0];
      expect(appcastClientArgs.has(APPCAST_SEARCH_SORT_BY), 'Map should contain sort by param').to
        .be.true;
      expect(
        appcastClientArgs.get(APPCAST_SEARCH_SORT_BY),
        'Sort param should be the correct sort type.',
      ).to.equal(APPCAST_SORT_POSTED_AT);
      expect(
        appcastClientArgs.has(APPCAST_SEARCH_SORT_DIRECTION),
        'Map should contain sort direction param',
      ).to.be.true;
      expect(
        appcastClientArgs.get(APPCAST_SEARCH_SORT_DIRECTION),
        'Sort direction should be the correct sort type.',
      ).to.equal(APPCAST_SORT_DIRECTION_DESC);
    });

    it('sorting by distance calls appcast with sort option and direction', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const testSearchCriteria: HustleSearchCriteria = {
        lat: '34.052',
        long: '-118.243',
        distanceSort: HustleSortOrder.ASC,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      const appcastClientStubArgs = appcastClientStub.lastCall.args;
      expect(appcastClientStubArgs.length).to.equal(1);
      const appcastClientArgs: Map<string, string> = appcastClientStubArgs[0];
      expect(appcastClientArgs.has(APPCAST_SEARCH_SORT_BY), 'Map should contain sort by param').to
        .be.true;
      expect(
        appcastClientArgs.get(APPCAST_SEARCH_SORT_BY),
        'Sort param should be the correct sort type.',
      ).to.equal(APPCAST_SORT_LOCATION);
      expect(
        appcastClientArgs.has(APPCAST_SEARCH_SORT_DIRECTION),
        'Map should contain sort direction param',
      ).to.be.true;
      expect(
        appcastClientArgs.get(APPCAST_SEARCH_SORT_DIRECTION),
        'Sort direction should be the correct sort type.',
      ).to.equal(APPCAST_SORT_DIRECTION_ASC);
    });

    it('searching with page criteria uses expected params', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const expectedParams: Map<string, string> = new Map();
      expectedParams.set(APPCAST_SEARCH_KEYWORD, 'apricots');
      expectedParams.set(APPCAST_SEARCH_PAGE, '42');

      const testSearchCriteria: HustleSearchCriteria = {
        keywords: ['apricots'],
        page: 42,
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      expect(
        appcastClientStub.lastCall.args,
        'Appcast client args should match expected map',
      ).to.deep.equals([expectedParams]);
    });

    it('searching by multiple criterion uses expected params', async () => {
      const appcastClientStub = sandbox.stub(AppcastClient, 'searchJobs').resolves(emptyResult);
      const expectedParams: Map<string, string> = new Map();
      expectedParams.set(APPCAST_SEARCH_COORDINATES, '40.712,-74.006'); // NYC
      expectedParams.set(APPCAST_SEARCH_FUNCTION, 'Customer Service');
      expectedParams.set(APPCAST_SEARCH_KEYWORD, 'beauty');

      const testSearchCriteria: HustleSearchCriteria = {
        keywords: ['beauty'],
        category: HustleCategory.CUSTOMER_SERVICE,
        lat: '40.712',
        long: '-74.006',
      };

      await AppcastProvider.searchHustles(testSearchCriteria);

      sandbox.assert.calledOnce(appcastClientStub);
      expect(
        appcastClientStub.lastCall.args,
        'Appcast client args should match expected map',
      ).to.deep.equals([expectedParams]);
    });
  });

  describe('getHustle', () => {
    it('should return AppcastJob as Hustle', async () => {
      const appcastJob: AppcastJob = {
        job_id: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        title: 'Amazon Shopper',
        subject: 'some subject', // required field according to AppcastJob type but not in the sample response, optional?
        advertiser_id: 'some ad id', //same ^
        location: {
          country: 'United States',
          state: 'CA',
          city: 'Los Angeles',
          zip: '90066',
        },
        logo_url: 'fakeLogoUrl',
        body:
          '<table class="htmlDetailElementTable" border="0" cellpadding="0" cellspacing="0">\n<tr><td><div class="sfdc_richtext" id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver',
        url:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        employer: 'Amazon Workforce Staffing',
        function: 'Customer Service',
        posted_at: '2020-05-08T00:00:00Z',
        cpc: 0.23,
        cpa: 9.0,
        search_position: 13,
      };
      sandbox.stub(AppcastClient, 'searchByAppcastJobId').resolves(appcastJob);
      const expectedHustle: Hustle = {
        name: 'Amazon Shopper',
        company: 'Amazon Workforce Staffing',
        postedDate: moment('2020-05-08T00:00:00Z'),
        description:
          '<table cellspacing="0" cellpadding="0" border="0" class="htmlDetailElementTable">\n<tbody><tr><td><div id="j_id0:portId:j_id75j_id0:portId:j_id75_00NF000000CFqt6_div" class="sfdc_richtext">\n<span style="font-size: 11pt;"><span><span><b>Warehouse/Shopper Team Member (Full-Time, Seasonal, Part-Time, Flexible Hours)</b><br><br><b>Shifts</b><br>Overnight, Sunrise, Day, Evening, Weekend<br><br><b>Location</b><br><br>El Segundo, South Gate, Hawthorne, Rosemead,  Commerce, Long Beach, Pasadena, Torrance, Vernon, Silver Lake, Chatsworth, Playa Vista, Beverly Hills, Redondo Beach, Fairfax, Santa Monica, Glendale, Venice, West LA and Downtown LA.<br><br>Job opportunities vary by location. We update postings daily with open positions.<br><br><b>Salary </b></span></span><br><span style=""><span style=""><span style="color: #060000;">Earn $15/hr or more</span></span></span></span><br><br><span style="font-size: 11pt;"><span><span><b>Job Descriptions</b><br><br><br><b>Delivery Stations</b> – Amazon’s deliver</span></span></span></div></td></tr></tbody></table>',
        city: 'Los Angeles',
        state: 'CA',
        affiliateLink:
          'https://click.appcast.io/track/3njptku?cs=hlm&exch=6u&jg=2lro&bid=Ybcpqjjljpfgk5fZEFmcRA==&sar_id=9syxt2&jpos=13',
        category: HustleCategory.CUSTOMER_SERVICE,
        externalId: '8984_200029667-9c738211687599cca0b01176dbc5fb7c',
        isActive: true,
        hustlePartner: HustlePartner.Appcast,
        logo: appcastJob.logo_url,
      };
      const hustle = await AppcastProvider.getHustle(appcastJob.job_id);
      expect(hustle).to.eql(expectedHustle);
    });

    it('should propagate errors', async () => {
      sandbox.stub(AppcastClient, 'searchByAppcastJobId').rejects(new AppcastInvalidJobIdError());
      await expect(AppcastProvider.getHustle('some external id')).to.be.rejectedWith(
        AppcastInvalidJobIdError,
      );
    });
  });

  describe('sanitizeDescription', () => {
    it('checks for malicious code', () => {
      const sampleHtml = `Blah blah <script>alert('hi')</script> blah blah`;
      const result = AppcastProvider.sanitizeDescription(sampleHtml);
      expect(result.match(/<script.*<\/script>/)).to.not.exist;
    });

    it('removes links', () => {
      const sampleHtml = `<p style=\"margin: 0in; margin-bottom: .0001pt;\"><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #333333; border: none windowtext 1.0pt; padding: 0in;\">At Allied Universal</span><sup><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #201f1e;\">®</span></sup><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #201f1e;\"> </span><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #333333; border: none windowtext 1.0pt; padding: 0in;\">our Security Professionals assist clients, and the public at large, by providing essential jobs that keep our communities safe and secure.  During this time, we need your help more than ever.  <u>We have immediate employment opportunities</u>.  Allied Universal also employs <a href=\"https://protect-us.mimecast.com/s/TZIqCmZ8YgcmBqWnC9lOtz?domain=jobs.aus.com\" target=\"_blank\" data-auth=\"NotApplicable\" rel=\"noopener\"><span style=\"color: #333333;\">an interview process you can complete from the comfort of your home through our online</span></a> application and video</span><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #1f497d; border: none windowtext 1.0pt; padding: 0in;\"> </span><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #333333; border: none windowtext 1.0pt; padding: 0in;\">interviewing technology.  We are North America’s leading security services provider with over 200,000 phenomenal employees and invite you to apply to join the team.</span></p><br /><p style=\"margin-bottom: .0001pt;\"><strong><span style=\"font-size: 14pt; font-family: verdana, geneva; color: #000080;\">Shift Supervisor Armed $22.96/Hr</span></strong></p><p style=\"margin-bottom: .0001pt;\"><strong><span style=\"font-size: 14pt; font-family: verdana, geneva; color: #000080;\">Must Have 2 Years of Security Experience </span></strong></p><p style=\"margin-bottom: .0001pt;\"><strong><span style=\"font-size: 14pt; font-family: verdana, geneva; color: #000080;\">Must Have a Valid Firesarmes Permit / .40 Caliber </span></strong></p><p style=\"margin-bottom: .0001pt;\"><strong><span style=\"font-size: 14pt; font-family: verdana, geneva; color: #000080;\">Full Time Graveyard Shift 9:30pm - 5:30am / Wednesday & THursday Off</span></strong></p><p style=\"margin-bottom: .0001pt;\"><span style=\"font-size: 10pt; font-family: verdana, geneva;\"><span style=\"color: #000080;\"><strong><span style=\"font-size: 14pt;\">Long Beach Area</span></strong></span> </span></p><p style=\"margin-bottom: .0001pt;\"> </p><p style=\"margin-bottom: .0001pt;\"><span style=\"font-size: 10pt; font-family: verdana, geneva;\"> Allied Universal Services is seeking the position of an <strong>Armed Security Shift Supervisor</strong>.</span></p><p style=\"margin-bottom: .0001pt;\"><span style=\"font-size: 10pt; font-family: verdana, geneva;\"> </span></p><p style=\"margin-bottom: .0001pt;\"><span style=\"font-size: 10pt; font-family: verdana, geneva;\">The <strong>Armed Security Shift Supervisor</strong> will supervise and coordinate the delivery of quality services on a specific shift at an assigned customer. An <strong>Armed Security Shift Supervisor</strong> acts as a liaison between site supervisor, Account Manager/Field Operations Manager and professional security officers. They supervise staff on assigned shift, providing coaching, recognition and discipline within approved empowerment range.</span></p><p style=\"margin-bottom: .0001pt;\"> </p><p style=\"margin-bottom: .0001pt;\"><span style=\"font-family: verdana, geneva; font-size: 10pt;\"><strong><span style=\"color: black;\">QUALIFICATIONS/REQUIREMENTS:</span></strong></span></p><ul><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Be at least 21 years of age with high school diploma or equivalent</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Possess effective written and oral communication and interpersonal skills with ability to deal with all levels of personnel and the general public in a professional and effective manner</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Valid guard card/license, as required in the state for which you are applying. </span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">As a condition of employment, employee must successfully complete a background investigation and a drug screen in accordance with all federal, state, and local laws</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Display exceptional customer service and communication skills</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Have intermediate computer skills to operate innovative, wireless technology at client specific sites</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Ability to handle crisis situations at the client site, calmly and efficiently</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva;\">Communicate staffing needs on shift to Account Manager or Operations Manager</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva;\">Assure that officers receive appropriate training, developing them in both technical and professional skills</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva;\">Assure that employee grievances are heard with help from appropriate district or region HR support employees and Account or Operations Manager</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva;\">Administer JSA’s and safety programs outlining site-specific hazards for professional security officers on assigned shift including vehicle/driving safety as appropriate to Corporate procedures</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva;\">Assist Account or Operations Manager to manage uniforms, equipment, supplies and vehicles utilized at the account, maintaining appropriate inventories and maintenance checklists</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Able to:</span><ul><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Work in various environments such as cold weather, rain/snow or heat</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Occasionally lift or carry up to 40 pounds</span></li><li><span style=\"font-size: 10pt; font-family: verdana, geneva; color: black;\">Climb stairs, ramps, or ladders occasionally during shift</span></li><li>Stand or walk on various surfaces for long periods of time</li></ul></li></ul><br /><p style=\"margin: 0in; margin-bottom: .0001pt;\"><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: black; border: none windowtext 1.0pt; padding: 0in;\">Allied Universal provides unparalleled service, systems and solutions to the people and business of our communities, and is North America’s leading security services provider. With over 200,000 employees, Allied Universal delivers high-quality, tailored solutions, which allows clients to focus on their core business. For more information:  </span><span style=\"color: black;\"><a href=\"http://www.aus.com/\" target=\"_blank\" rel=\"noopener\"><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #954f72; border: none windowtext 1.0pt; padding: 0in;\">www.AUS.com</span></a></span><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: black; border: none windowtext 1.0pt; padding: 0in;\">.</span></p><p style=\"margin: 0in; margin-bottom: .0001pt;\"><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: #201f1e;\"> </span></p><p style=\"margin: 0in; margin-bottom: .0001pt;\"><span style=\"font-size: 9.0pt; font-family: 'Verdana',sans-serif; color: black; border: none windowtext 1.0pt; padding: 0in;\">We proudly support the Veteran Jobs Mission, a group of over 200 companies that have committed to collectively hiring a total of one million military veterans. <strong><span style=\"font-family: 'Verdana',sans-serif;\">EOE/Minorities/Females/Vet/Disability</span></strong> Allied Universal Services is an Equal Opportunity Employer committed to hiring a diverse workforce.</span></p><br />2020-450401`;
      const result = AppcastProvider.sanitizeDescription(sampleHtml);
      expect(result.match(/<a.*>.*<\/a>/)).to.not.exist;
    });
  });

  // Will be _skipped_ when running unit tests (hence `xit`)
  // This function actually reaches out across the interwebs and makes a real appcast search
  // It is useful for playing with different appcast queries.
  xit('Trying appcast for real', async () => {
    const params: Map<string, string> = new Map();
    params.set(APPCAST_SEARCH_KEYWORD, 'cat dog');
    params.set(APPCAST_SEARCH_JOBS_PER_PAGE, '2');
    params.set(APPCAST_SEARCH_PAGE, '2');
    params.set(APPCAST_SEARCH_RADIUS, '90miles');
    params.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_LOCATION);
    params.set(APPCAST_SEARCH_FUNCTION, 'Customer Service');
    params.set(APPCAST_SEARCH_COORDINATES, '34.052200,-118.243700');
    const response = await AppcastClient.searchJobs(params);
    // console.log(response);
    expect(response).is.not.null;
  });
});
