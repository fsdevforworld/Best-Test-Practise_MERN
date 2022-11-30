import { expect } from 'chai';
import * as sinon from 'sinon';
import appcast from '../../../src/lib/appcast';
import { getAppcastJobs } from '../../../src/api/v2/side-hustle/jobs/controller';
import factory from '../../factories';
import { InvalidParametersError } from '../../../src/lib/error';
import {
  APPCAST_SORT_DIRECTION_DESC,
  APPCAST_SEARCH_CITY_STATE,
  APPCAST_SORT_EMPLOYER,
  APPCAST_SEARCH_COUNTRY,
  APPCAST_SEARCH_JOBS_PER_PAGE,
  APPCAST_SEARCH_RADIUS,
  APPCAST_SEARCH_PAGE,
  APPCAST_SEARCH_SORT_BY,
  APPCAST_SEARCH_SORT_DIRECTION,
  APPCAST_SORT_DIRECTION_ASC,
  APPCAST_SORT_CPA,
} from '../../../src/lib/appcast/constants';
import * as config from 'config';

describe('AppCast Search', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('clean and insert default parameters before sending to appcast', () => {
    it('invalid param should throw', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const paramsWithInvalid: Map<string, string> = new Map();
      paramsWithInvalid.set('invalid', 'whocares');
      expect(() => {
        getAppcastJobs(paramsWithInvalid, u1);
      }).to.throw(InvalidParametersError, /invalid search parameter/);
    });

    it('whitespace only params should be ignored', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();
      const keyShouldBeMissing = 'l';
      const keyShouldBePresent = 'keyword';
      const valueShouldBePresent = 'shouldStillBePresent';

      params.set(keyShouldBeMissing, ' ');
      params.set(keyShouldBePresent, valueShouldBePresent);

      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      expect(paramsCalled.get(keyShouldBeMissing)).to.be.undefined;
      expect(paramsCalled.get(keyShouldBePresent)).to.equal(valueShouldBePresent.toLowerCase());
    });

    it('params should be trimed and lower cased', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();
      const keyMixedCaseNeedsTrim = 'keyword';
      const valueMixedCaseNeedsTrim = ' shouldStillBePresent   ';

      params.set(keyMixedCaseNeedsTrim, valueMixedCaseNeedsTrim);

      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      expect(paramsCalled.get(keyMixedCaseNeedsTrim)).to.equal(
        valueMixedCaseNeedsTrim.toLowerCase().trim(),
      );
    });

    it("if location not specified and user has city state, default l to user's city, state", async () => {
      const city = 'Noblesville';
      const state = 'IN';
      const u1 = await factory.build('user', { city, state }, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();

      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      expect(paramsCalled.get(APPCAST_SEARCH_CITY_STATE)).to.equal(`${city}, ${state}`);
    });

    it("if location not specified and user does not have both city and state, don't default l", async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();

      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      expect(paramsCalled.get(APPCAST_SEARCH_CITY_STATE)).to.be.undefined;

      const city = 'Noblesville';
      const u2 = await factory.build('user', { city }, { hasSession: true });
      const params2: Map<string, string> = new Map();

      await getAppcastJobs(params2, u2);
      const paramsCalled2 = stub.getCall(1).args[0]; // note incremented getCall
      expect(paramsCalled2.get(APPCAST_SEARCH_CITY_STATE)).to.be.undefined;

      const state = 'IN';
      const u3 = await factory.build('user', { state }, { hasSession: true });
      const params3: Map<string, string> = new Map();

      await getAppcastJobs(params3, u3);
      const paramsCalled3 = stub.getCall(2).args[0]; // note incremented getCall
      expect(paramsCalled3.get(APPCAST_SEARCH_CITY_STATE)).to.be.undefined;
    });

    it("if location is specified ignore user's city state", async () => {
      const userCity = 'Noblesville';
      const userState = 'IN';
      const u1 = await factory.build(
        'user',
        { city: userCity, state: userState },
        { hasSession: true },
      );
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();

      const paramCityState = 'East Troy, WI';
      params.set(APPCAST_SEARCH_CITY_STATE, paramCityState);

      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      expect(paramsCalled.get(APPCAST_SEARCH_CITY_STATE)).to.equal(paramCityState.toLowerCase());

      const params2: Map<string, string> = new Map();

      const paramCountry = 'France';
      params2.set(APPCAST_SEARCH_COUNTRY, paramCountry);

      await getAppcastJobs(params2, u1);
      const paramsCalled2 = stub.getCall(1).args[0]; // note incremented getCall
      expect(paramsCalled2.get(APPCAST_SEARCH_CITY_STATE)).to.be.undefined;
      expect(paramsCalled2.get(APPCAST_SEARCH_COUNTRY)).to.equal(paramCountry.toLowerCase());
    });

    it('if non-location params not specified, params should use defaults from config', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // this test is slightly fragile, it relies on configuration, consider checking appcast.defaultSearchValues in default.json if it breaks unexpectedly
      expect(paramsCalled.get(APPCAST_SEARCH_JOBS_PER_PAGE)).to.equal(
        config.get<string>('appcast.defaultSearchValues.jobs_per_page'),
      );
      expect(paramsCalled.get(APPCAST_SEARCH_RADIUS)).to.equal(
        config.get<string>('appcast.defaultSearchValues.r'),
      );
      expect(paramsCalled.get(APPCAST_SEARCH_PAGE)).to.equal(
        config.get<string>('appcast.defaultSearchValues.page'),
      );
    });

    it('if non-location params are specified, params should use them and ignore defaults from config', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      const params: Map<string, string> = new Map();
      const perPage = '20';
      params.set(APPCAST_SEARCH_JOBS_PER_PAGE, perPage);
      const radius = '10km';
      params.set(APPCAST_SEARCH_RADIUS, radius);
      const page = '2';
      params.set(APPCAST_SEARCH_PAGE, page);
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // if the config in appcast.defaultSearchValues changes, you might want to expect different params for this test
      expect(paramsCalled.get(APPCAST_SEARCH_JOBS_PER_PAGE)).to.equal(perPage);
      expect(paramsCalled.get(APPCAST_SEARCH_RADIUS)).to.equal(radius);
      expect(paramsCalled.get(APPCAST_SEARCH_PAGE)).to.equal(page);
    });
  });

  describe('validate and default search params for app cast', () => {
    it('invalid sort key should fail', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      params.set(APPCAST_SEARCH_SORT_BY, 'invalid');
      expect(() => {
        getAppcastJobs(params, u1);
      }).to.throw(InvalidParametersError);
    });

    it('invalid sort direction should fail', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      params.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_EMPLOYER);
      params.set(APPCAST_SEARCH_SORT_DIRECTION, 'invalid');
      expect(() => {
        getAppcastJobs(params, u1);
      }).to.throw(InvalidParametersError);
    });

    it('if no sort specified, should default', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // if the config in appcast.defaultSortValues changes, you probably need to expect different params for this test
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_BY)).to.equal(
        config.get<string>('appcast.defaultSortValues.sort_by'),
      );
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_DIRECTION)).to.equal(
        config.get<string>('appcast.defaultSortValues.sort_direction'),
      );
    });

    it('if valid sort column specified, but no order should keep column and default to ASC', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      params.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_EMPLOYER);
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // if the config in appcast.defaultSortValues changes, you probably need to expect different params for this test
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_BY)).to.equal(APPCAST_SORT_EMPLOYER);
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_DIRECTION)).to.equal(APPCAST_SORT_DIRECTION_ASC);
    });

    it('if valid sort column specified but no order, and the column is cpa, should keep column and default to DESC', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      params.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_CPA);
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // if the config in appcast.defaultSortValues changes, you probably need to expect different params for this test
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_BY)).to.equal(APPCAST_SORT_CPA);
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_DIRECTION)).to.equal(APPCAST_SORT_DIRECTION_DESC);
    });

    it('if valid sort column and order specified, should use them', async () => {
      const u1 = await factory.build('user', {}, { hasSession: true });
      const params: Map<string, string> = new Map();
      params.set(APPCAST_SEARCH_SORT_BY, APPCAST_SORT_EMPLOYER);
      params.set(APPCAST_SEARCH_SORT_DIRECTION, APPCAST_SORT_DIRECTION_DESC);
      const stub = sandbox.stub(appcast, 'searchJobs').returns([]);
      await getAppcastJobs(params, u1);
      const paramsCalled = stub.getCall(0).args[0];
      // if the config in appcast.defaultSortValues changes, you probably need to expect different params for this test
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_BY)).to.equal(APPCAST_SORT_EMPLOYER);
      expect(paramsCalled.get(APPCAST_SEARCH_SORT_DIRECTION)).to.equal(APPCAST_SORT_DIRECTION_DESC);
    });
  });
});
