import * as Bluebird from 'bluebird';
import { AppsFlyerEvents, deleteUser, logAppsflyerEvent } from '../../src/lib/appsflyer';
import { Platforms } from '../../src/typings';
import factory from '../factories';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'superagent';
import { clean, stubBankTransactionClient, up, replayHttp, fakeDate } from '../test-helpers';
import logger from '../../src/lib/logger';
import UUID from '../../src/lib/uuid';

describe('AppsFlyer', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    return up();
  });

  afterEach(() => clean(sandbox));

  describe('logAppsflyerEvent', async () => {
    it('fails to submits data to appsflyer because appsflyerDeviceId is missing', async () => {
      const userId = 684;
      const eventName = AppsFlyerEvents.BANK_CONNECTED_S2S;
      const ip = '76.171.211.40';
      const datadogStub = sandbox.stub(dogstatsd, 'increment').resolves();
      await logAppsflyerEvent({ userId, platform: Platforms.iOS, eventName, ip });
      expect(datadogStub).to.be.calledWith('log_appsflyer_event.appsflyer_device_id_missing', {
        eventName,
      });
    });

    it('fails to submit data to appsflyer because platform is missing from database', async () => {
      const userId = 684;
      const eventName = AppsFlyerEvents.BANK_CONNECTED_S2S;
      const ip = '76.171.211.40';
      await factory.create('campaign-info');
      const stub = sandbox.stub(dogstatsd, 'increment').resolves();

      await logAppsflyerEvent({ userId, eventName, ip });

      expect(stub).to.be.calledOnce;
      expect(stub.firstCall.args[0]).to.equal('log_appsflyer_event.platform_field_missing');
    });

    it('submits the data successfully to appsflyer when the latest available "platform" is supplied by the database', async () => {
      const userId = 684;
      const eventName = AppsFlyerEvents.BANK_CONNECTED_S2S;
      const ip = '76.171.211.40';
      const appsflyerDeviceId = '1552649463735-1979453';
      await factory.create('campaign-info', {
        userId,
        platform: Platforms.Android,
        created: new Date('2020-01-01'),
      });
      await factory.create('campaign-info', {
        userId,
        platform: Platforms.iOS,
        created: new Date('2020-01-02'),
      });
      await factory.create('campaign-info', {
        userId,
        appsflyerDeviceId,
        created: new Date('2020-01-03'),
      });
      sandbox.stub(request, 'post').returns({
        set: () => ({
          send: () => Bluebird.resolve({ ok: true }),
        }),
      });

      const datadogStub = sandbox.stub(dogstatsd, 'increment').resolves();
      await logAppsflyerEvent({ userId, eventName, ip });
      expect(datadogStub).not.to.have.been.called;
    });

    it('submits the data successfully to appsflyer when the latest available device id is supplied by the database', async () => {
      const userId = 684;
      const eventName = AppsFlyerEvents.BANK_CONNECTED_S2S;
      const ip = '76.171.211.40';
      const appsflyerDeviceId = '1552649463735-1979453';
      await factory.create('campaign-info', {
        userId,
        deviceId: '1',
        created: new Date('2020-01-01'),
      });
      await factory.create('campaign-info', {
        userId,
        deviceId: '2',
        platform: Platforms.iOS,
        created: new Date('2020-01-02'),
      });
      await factory.create('campaign-info', {
        userId,
        deviceId: '3',
        appsflyerDeviceId,
        created: new Date('2020-01-03'),
      });
      sandbox.stub(request, 'post').returns({
        set: () => ({
          send: () => Bluebird.resolve({ ok: true }),
        }),
      });
      const datadogStub = sandbox.stub(dogstatsd, 'increment').resolves();
      await logAppsflyerEvent({ userId, eventName, ip });
      expect(datadogStub).not.to.have.been.called;
    });

    it('submits the data to appsflyer but error occurs and has datadog stat', async () => {
      const userId = 684;
      const eventName = AppsFlyerEvents.BANK_CONNECTED_S2S;
      const ip = '76.171.211.40';
      const appsflyerDeviceId = '1552649463735-1979453';

      await factory.create('campaign-info', { userId, appsflyerDeviceId });
      sandbox.stub(request, 'post').returns({
        set: () => ({
          send: () => Bluebird.reject({ message: 'AppsFlyer is down.' }),
        }),
      });
      const datadogStub = sandbox.stub(dogstatsd, 'increment').resolves();
      await logAppsflyerEvent({ userId, platform: Platforms.iOS, eventName, ip });
      expect(datadogStub).to.be.calledWith('log_appsflyer_event.error', { eventName });
    });
  });

  describe('deleteUser', () => {
    it(
      'should delete the appsflyer user properly',
      replayHttp('../fixtures/lib/appsflyer/delete-user-success.json', async () => {
        const userId = 684;
        const appsflyerDeviceId = '1552649463735-1979453';
        const platform = 'ios';
        const uuid = '41d54f51-51f2-433d-802b-89e1ef0a94d5';
        const submittedTime = '2020-07-02T22:01:32.559Z';

        await factory.create('campaign-info', { userId, appsflyerDeviceId, platform });

        fakeDate(sandbox, submittedTime, 'YYYY-MM-DDTHH:mm:ss[Z]');
        const loggerStub = sandbox.stub(logger, 'info');
        sandbox.stub(UUID, 'uuid').returns(uuid);

        await deleteUser(userId);

        expect(loggerStub?.firstCall?.args[0]).to.be.eq(
          'Successfully sent delete request to appsflyer',
        );
        expect(loggerStub?.firstCall?.args[1]?.body?.subject_request_id).to.be.eq(uuid);
      }),
    );

    it(
      'should log the error if there is an error making the api call',
      replayHttp('../fixtures/lib/appsflyer/delete-user-error.json', async () => {
        const userId = 684;
        const appsflyerDeviceId = '';
        const platform = 'ios';
        const uuid = '41d54f51-51f2-433d-802b-89e1ef0a94d5';
        const submittedTime = '2020-07-02T22:01:32.559Z';

        await factory.create('campaign-info', { userId, appsflyerDeviceId, platform });

        fakeDate(sandbox, submittedTime, 'YYYY-MM-DDTHH:mm:ss[Z]');
        const loggerStub = sandbox.stub(logger, 'error');
        sandbox.stub(UUID, 'uuid').returns(uuid);

        await deleteUser(userId);

        expect(loggerStub?.firstCall?.args[0]).to.be.eq('Error deleting user from appsflyer');
      }),
    );
  });
});
