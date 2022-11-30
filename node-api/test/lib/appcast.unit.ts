import { expect } from 'chai';
import AppcastClient from '../../src/lib/appcast';
import { AppcastMetrics, metrics } from '../../src/lib/appcast/metrics';
import { AppcastResponseError } from '../../src/lib/error';
import logger from '../../src/lib/logger';
import * as sinon from 'sinon';

describe('AppcastClient', () => {
  const sandbox = sinon.createSandbox();
  let metricsStub: sinon.SinonStub;
  let loggerStub: sinon.SinonStub;

  beforeEach(() => {
    metricsStub = sandbox.stub(metrics, 'increment');
    loggerStub = sandbox.stub(logger, 'error');
    sandbox.stub(AppcastClient.agent, 'post').returns({
      send: sandbox.stub().rejects(),
    });
  });

  afterEach(sandbox.restore);
  describe('searchByAppcastJobId', () => {
    it('should return AppcastResponseError when Appcast is down', async () => {
      const jobId = '10704_req46699';
      await expect(AppcastClient.searchByAppcastJobId(jobId)).to.be.rejectedWith(
        AppcastResponseError,
      );
      expect(metricsStub).to.be.calledWithExactly(AppcastMetrics.HUSTLE_APPCAST_FAIL);
      expect(loggerStub).to.be.calledOnce;
    });
  });

  describe('searchJobs', () => {
    it('should return AppcastResponseError when Appcast is down', async () => {
      const params = new Map<string, string>();
      await expect(AppcastClient.searchJobs(params)).to.be.rejectedWith(AppcastResponseError);
      expect(metricsStub).to.be.calledWithExactly(AppcastMetrics.HUSTLE_APPCAST_FAIL);
      expect(loggerStub).to.be.calledOnce;
    });
  });
});
