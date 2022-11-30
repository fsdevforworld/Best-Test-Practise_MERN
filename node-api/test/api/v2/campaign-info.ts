import * as request from 'supertest';
import app from '../../../src/api';

import { CampaignInfo, SubscriptionBilling } from '../../../src/models';
import { moment } from '@dave-inc/time-lib';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import promotionsClient from '@dave-inc/promotions-client';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { AppsFlyerEvents } from '../../../src/lib/appsflyer';

describe('campaign_info', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    await clean(sandbox);
    return up();
  });

  after(() => clean(sandbox));

  describe('POST /v2/appsflyer_webhook/campaign_info', () => {
    describe('user created event', () => {
      const defaultData = {
        appsflyer_device_id: '1552518886777-6444902',
        event_name: AppsFlyerEvents.USER_CREATED,
        customer_user_id: 1,
      };

      async function callWebhookPost(data: any) {
        return request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send(data)
          .expect(200);
      }

      it('should update userId', async () => {
        const campagignInfo = await factory.create<CampaignInfo>('campaign-info', {
          userId: null,
          appsflyerDeviceId: 'test',
        });
        const data = {
          event_name: AppsFlyerEvents.USER_CREATED,
          customer_user_id: 1000,
          appsflyer_device_id: 'test',
        };
        await callWebhookPost(data);
        await campagignInfo.reload();
        expect(campagignInfo.userId).to.equal(1000);
      });

      it('should increment a metric when the API is missing required parameters', async () => {
        const data = { event_name: AppsFlyerEvents.USER_CREATED };
        const ddSpy = sandbox.spy(dogstatsd, 'increment');

        await callWebhookPost(data);

        expect(ddSpy).to.have.callCount(3);
        expect(ddSpy.secondCall).to.have.been.calledWith('campaign_info_missing_install_record');
      });

      it('should send an event to the promotions api if the user was referred', async () => {
        const campaignStub = sandbox
          .stub(CampaignInfo, 'findOne')
          .resolves({ userId: 1, referrerId: 2, campaign: 'hi' });
        const handleReferredUserStub = sandbox
          .stub(promotionsClient, 'handleReferredUser')
          .resolves();
        const ddSpy = sandbox.spy(dogstatsd, 'increment');

        await callWebhookPost(defaultData);

        expect(campaignStub).to.be.callCount(1);
        expect(handleReferredUserStub).to.have.callCount(1);
        expect(handleReferredUserStub).to.have.been.calledWith({
          userId: 1,
          referrerId: 2,
          campaignId: 'hi',
        });
        expect(ddSpy.secondCall).to.have.been.calledWith('campaign_info_referrer_found');
        expect(ddSpy.thirdCall).to.have.been.calledWith('campaign_info_referred_user_success');
        expect(ddSpy).to.have.callCount(4);
      });

      it('should not send any events if the user was not referred', async () => {
        const campaignStub = sandbox.stub(CampaignInfo, 'findOne').resolves(null);
        const handleReferredUserSpy = sandbox.spy(promotionsClient, 'handleReferredUser');
        const ddSpy = sandbox.spy(dogstatsd, 'increment');

        await callWebhookPost(defaultData);

        expect(campaignStub).to.be.callCount(1);
        expect(handleReferredUserSpy).to.be.callCount(0);
        expect(ddSpy).to.be.callCount(3);
      });

      it('should send metrics when calling the promotions api fails', async () => {
        const campaignStub = sandbox
          .stub(CampaignInfo, 'findOne')
          .resolves({ userId: 1, referrerId: 2, campaign: 'hi' });
        const handleReferredUserSpy = sandbox
          .stub(promotionsClient, 'handleReferredUser')
          .rejects(new Error('very sad'));

        const ddSpy = sandbox.spy(dogstatsd, 'increment');

        await callWebhookPost(defaultData);

        expect(campaignStub).to.be.callCount(1);
        expect(handleReferredUserSpy).to.be.callCount(1);
        expect(ddSpy).to.be.callCount(4);
        expect(ddSpy.secondCall).to.have.been.calledWith('campaign_info_referrer_found');
        expect(ddSpy.thirdCall).to.have.been.calledWith('campaign_info_referred_user_failure');
      });
    });

    describe('webhook post', () => {
      it('should create a new campaign_info row if none exists - simple', async () => {
        const appsflyerDeviceId = 'foo';
        const sendData = {
          media_source: 'hi-there',
          appsflyer_device_id: appsflyerDeviceId,
          event_type: 'install',
          // GMT: Tuesday, March 19, 2019 5:34:25 PM
          install_time_selected_timezone: '2019-03-19 10:34:25.000-0700',
        };

        const res = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send(sendData)
          .expect(200);

        expect(res.body)
          .to.have.property('ok')
          .to.equal(true);

        const campaignInfo = await CampaignInfo.findOne({
          where: { appsflyerDeviceId },
        });
        expect(campaignInfo.network).to.equal('hi-there');
        const installedDate = campaignInfo.appsflyerInstalledDate.utc().format();
        expect(installedDate).to.equal('2019-03-19T17:34:25Z');
      });

      it('should update campaign info with bank connected timestamp', async () => {
        const appsflyerDeviceId = 'foo';
        const res1 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            media_source: 'foo',
            appsflyer_device_id: appsflyerDeviceId,
            event_type: 'install',
          })
          .expect(200);

        expect(res1.body)
          .to.have.property('ok')
          .to.equal(true);

        const res2 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({ event_name: 'phone number verified', appsflyer_device_id: appsflyerDeviceId })
          .expect(200);

        expect(res2.body)
          .to.have.property('ok')
          .to.equal(true);

        const results1 = await CampaignInfo.findAll();
        expect(results1.length).to.equal(1);
        expect(results1[0].bankConnectedDate).to.eq(null);

        const beforeRequest = moment();
        const res3 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            event_name: 'bank connected',
            event_time: beforeRequest,
            appsflyer_device_id: appsflyerDeviceId,
          })
          .expect(200);

        expect(res3.body)
          .to.have.property('ok')
          .to.equal(true);

        const results2 = await CampaignInfo.findAll();
        expect(results2.length).to.equal(1);
        expect(moment(results2[0].bankConnectedDate).isSameOrAfter(beforeRequest, 'second')).to.eq(
          true,
        );
      });

      it('should attribute free month to referrer given free month campaign', async () => {
        const appsflyerDeviceId = 'foo';
        const referrerId = 1;
        const userId = 2;
        const campaign = 'free month';

        const brazeStub = sandbox.stub(braze, 'track');

        await factory.create('subscription-billing', {
          amount: 1,
          userId: referrerId,
        });

        await factory.create('subscription-billing', {
          amount: 1,
          userId,
        });

        await factory.create('campaign-info', {
          userId,
          referrerId,
          appsflyerDeviceId,
          campaign,
        });

        const billingBeforeReferrer = await SubscriptionBilling.findOne({
          where: { userId: referrerId },
        });
        expect(billingBeforeReferrer.amount).to.equal(1);
        expect(billingBeforeReferrer.referredUserId).to.equal(null);

        const billingBeforeReferree = await SubscriptionBilling.findOne({ where: { userId } });
        expect(billingBeforeReferree.amount).to.equal(1);
        expect(billingBeforeReferree.referredUserId).to.equal(null);

        await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            event_name: 'bank connected',
            appsflyer_device_id: appsflyerDeviceId,
          })
          .expect(200);

        const billingAfterReferrer = await SubscriptionBilling.findOne({
          where: { userId: referrerId },
        });
        expect(billingAfterReferrer.amount).to.equal(0);
        expect(billingAfterReferrer.referredUserId).to.equal(userId);
        expect(brazeStub.firstCall).to.be.calledWith({
          events: [
            sinon.match({
              name: 'free month earned',
              externalId: '1',
            }),
          ],
        });

        const billingAfterReferree = await SubscriptionBilling.findOne({ where: { userId } });
        expect(billingAfterReferree.amount).to.equal(0);
        expect(billingAfterReferree.referredUserId).to.equal(userId);
        expect(brazeStub.secondCall).to.be.calledWith({
          events: [
            sinon.match({
              name: 'free month earned',
              externalId: '2',
            }),
          ],
        });
      });

      it('should NOT attribute free month to referrer given other campaign', async () => {
        const appsflyerDeviceId = 'foo';
        const referrerId = 1;
        const userId = 2;
        const campaign = 'get 15 give 15';

        await factory.create('subscription-billing', {
          amount: 1,
          userId: referrerId,
        });

        await factory.create('subscription-billing', {
          amount: 1,
          userId,
        });

        await factory.create('campaign-info', {
          userId,
          referrerId,
          appsflyerDeviceId,
          campaign,
        });

        const billingBeforeReferrer = await SubscriptionBilling.findOne({
          where: { userId: referrerId },
        });
        expect(billingBeforeReferrer.amount).to.equal(1);
        expect(billingBeforeReferrer.referredUserId).to.equal(null);

        const billingBeforeReferree = await SubscriptionBilling.findOne({ where: { userId } });
        expect(billingBeforeReferree.amount).to.equal(1);
        expect(billingBeforeReferree.referredUserId).to.equal(null);

        await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            event_name: 'bank connected',
            appsflyer_device_id: appsflyerDeviceId,
          })
          .expect(200);

        const billingAfterReferrer = await SubscriptionBilling.findOne({
          where: { userId: referrerId },
        });
        expect(billingAfterReferrer.amount).to.equal(1);
        expect(billingAfterReferrer.referredUserId).to.equal(null);

        const billingAfterReferree = await SubscriptionBilling.findOne({ where: { userId } });
        expect(billingAfterReferree.amount).to.equal(1);
        expect(billingAfterReferree.referredUserId).to.equal(null);
      });

      it('should create a new campaign_info row if none exists - all', async () => {
        const appsflyerDeviceId = '1552518886777-6444902';
        const sendData = {
          media_source: 'facebook',
          campaign: 'my cool campaign',
          af_ad: 'crazy cat lady 18-24m',
          click_url: 'http://dave.com?clickid=test',
          appsflyer_device_id: appsflyerDeviceId,
          event_type: 'install',
        };

        const res = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send(sendData)
          .expect(200);

        expect(res.body)
          .to.have.property('ok')
          .to.equal(true);

        const campaignInfo = await CampaignInfo.findOne({
          where: { appsflyerDeviceId },
        });
        expect(campaignInfo.userId).to.equal(null);
        expect(campaignInfo.campaign).to.equal('my cool campaign');
        expect(campaignInfo.adgroup).to.equal('crazy cat lady 18-24m');
        expect(campaignInfo.clickLabel).to.equal('test');
        expect(campaignInfo.appsflyerDeviceId).to.equal(appsflyerDeviceId);
      });

      it('should create campaign with userId if exists in event data', async () => {
        const appsflyerDeviceId = '1552518886777-6444902';
        const sendData = {
          media_source: 'hi-there',
          appsflyer_device_id: appsflyerDeviceId,
          event_type: 'install',
          customer_user_id: 1,
        };

        const res = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send(sendData)
          .expect(200);

        expect(res.body)
          .to.have.property('ok')
          .to.equal(true);

        const campaignInfo = await CampaignInfo.findOne({ where: { appsflyerDeviceId } });
        expect(campaignInfo.network).to.equal('hi-there');
        expect(campaignInfo.userId).to.equal(1);
        expect(campaignInfo.appsflyerDeviceId).to.equal(appsflyerDeviceId);
      });

      it('should create a new record for each appsflyer device id', async () => {
        const appsflyerDeviceId1 = '1552518886777-6444902';
        const appsflyerDeviceId2 = '1552518886777-6444903';

        const res1 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            media_source: 'foo',
            idfv: 'test1234',
            appsflyer_device_id: appsflyerDeviceId1,
            event_type: 'install',
          })
          .expect(200);
        expect(res1.body)
          .to.have.property('ok')
          .to.equal(true);

        // post again to verify we don't create two records for this appsflyer device id
        const res1Duplicate = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            media_source: 'foo',
            idfv: 'test1234',
            appsflyer_device_id: appsflyerDeviceId1,
            event_type: 'install',
          })
          .expect(200);
        expect(res1Duplicate.body)
          .to.have.property('ok')
          .to.equal(true);

        const res2 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            media_source: 'bar',
            idfv: 'test1234',
            appsflyer_device_id: appsflyerDeviceId2,
            event_type: 'install',
          })
          .expect(200);

        expect(res2.body)
          .to.have.property('ok')
          .to.equal(true);

        const results = await CampaignInfo.findAll({ order: [['created', 'ASC']] });
        expect(results.length).to.equal(2);
        expect(results[0].appsflyerDeviceId).to.equal(appsflyerDeviceId1);
        expect(results[1].appsflyerDeviceId).to.equal(appsflyerDeviceId2);
      });

      it('should update campaign info with bank connected timestamp', async () => {
        const appsflyerDeviceId = 'foo';
        const res1 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            media_source: 'foo',
            appsflyer_device_id: appsflyerDeviceId,
            event_type: 'install',
          })
          .expect(200);

        expect(res1.body)
          .to.have.property('ok')
          .to.equal(true);

        const res2 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({ event_name: 'phone number verified', appsflyer_device_id: appsflyerDeviceId })
          .expect(200);

        expect(res2.body)
          .to.have.property('ok')
          .to.equal(true);

        const results1 = await CampaignInfo.findAll();
        expect(results1.length).to.equal(1);
        expect(results1[0].bankConnectedDate).to.eq(null);

        const beforeRequest = moment();
        const res3 = await request(app)
          .post('/v2/appsflyer_webhook/campaign_info')
          .send({
            event_name: 'bank connected',
            event_time: beforeRequest,
            appsflyer_device_id: appsflyerDeviceId,
          })
          .expect(200);

        expect(res3.body)
          .to.have.property('ok')
          .to.equal(true);

        const results2 = await CampaignInfo.findAll();
        expect(results2.length).to.equal(1);
        expect(moment(results2[0].bankConnectedDate).isSameOrAfter(beforeRequest, 'second')).to.eq(
          true,
        );
      });
    });
  });

  describe('GET /campaign_info', () => {
    it('returns a campaign info record', async () => {
      const expectedAttributedTouchTime = moment().subtract(3, 'days');
      const expectedDaveInstalledDate = moment().subtract(10, 'days');

      const expectedCampaignInfo: CampaignInfo = await factory.create('campaign-info', {
        network: 'expected network',
        campaign: 'expected campaign',
        adgroup: 'expected adgroup',
        adset: 'adset',
        keywords: 'keywordas',
        attributedTouchTime: expectedAttributedTouchTime,
        attributedTouchType: 'attributed touch type',
        isRetargeting: true,
        daveInstalledDate: expectedDaveInstalledDate,
        referrerId: 4,
        referrerName: 'referrer name',
        referrerImageUrl: 'referrerImageUrl',
      });

      const { body } = await request(app)
        .get('/v2/campaign_info')
        .query({
          appsflyerDeviceId: expectedCampaignInfo.appsflyerDeviceId,
        })
        .expect(200);

      expect(expectedCampaignInfo.network).to.equal(body.network);
      expect(expectedCampaignInfo.campaign).to.equal(body.campaign);
      expect(expectedCampaignInfo.adgroup).to.equal(body.adgroup);
      expect(expectedCampaignInfo.adset).to.equal(body.adset);
      expect(expectedCampaignInfo.keywords).to.equal(body.keywords);
      expect(expectedCampaignInfo.attributedTouchTime.format()).to.equal(body.attributedTouchTime);
      expect(expectedCampaignInfo.attributedTouchType).to.equal(body.attributedTouchType);
      expect(expectedCampaignInfo.isRetargeting).to.equal(body.isRetargeting);
      expect(expectedCampaignInfo.daveInstalledDate.isSame(body.daveInstalledDate, 'second')).to.be
        .true;
      expect(expectedCampaignInfo.referrerId).to.equal(body.referrerId);
    });
  });

  describe('POST /campaign_info', () => {
    describe('app client post', () => {
      it('should create a new campaign_info row if none exists - simple', async () => {
        const appsflyerDeviceId = '1552518886777-6444902';
        const sendData = {
          deviceId: '4N0bDpOdsiykLFKa',
          appsflyerDeviceId,
          eventName: 'app installed',
          firstInstallTime: '1553023201846', // Tuesday, March 19, 2019 7:20:01.846 PM
        };

        await request(app)
          .post('/v2/campaign_info')
          .send(sendData)
          .expect(200);

        const campaignInfo = await CampaignInfo.findOne({
          where: { appsflyerDeviceId },
        });
        expect(campaignInfo.daveInstalledDate.utc().format()).to.equal('2019-03-19T19:20:01Z');
      });

      it('should create a new record for each appsflyer device id', async () => {
        const appsflyerDeviceId1 = '1552518886777-6444902';
        const appsflyerDeviceId2 = '1552518886777-6444903';
        const sendData = {
          deviceId: '4N0bDpOdsiykLFKa',
          eventName: 'app installed',
          firstInstallTime: '1553023201846', // Tuesday, March 19, 2019 7:20:01.846 PM
        };

        const res1 = await request(app)
          .post('/v2/campaign_info')
          .send({
            appsflyerDeviceId: appsflyerDeviceId1,
            ...sendData,
          })
          .expect(200);
        expect(res1.body)
          .to.have.property('daveInstalledDate')
          .to.equal('2019-03-19T19:20:01.000Z');

        // post again to verify we don't create two records for this appsflyer device id
        const res1Duplicate = await request(app)
          .post('/v2/campaign_info')
          .send({
            appsflyerDeviceId: appsflyerDeviceId1,
            ...sendData,
          })
          .expect(200);
        expect(res1Duplicate.body)
          .to.have.property('daveInstalledDate')
          .to.equal('2019-03-19T19:20:01.000Z');

        const res2 = await request(app)
          .post('/v2/campaign_info')
          .send({
            appsflyerDeviceId: appsflyerDeviceId2,
            ...sendData,
          })
          .expect(200);
        expect(res2.body)
          .to.have.property('daveInstalledDate')
          .to.equal('2019-03-19T19:20:01.000Z');

        const results = await CampaignInfo.findAll({ order: [['created', 'ASC']] });
        expect(results[0].appsflyerDeviceId).to.equal(appsflyerDeviceId1);
        expect(results[1].appsflyerDeviceId).to.equal(appsflyerDeviceId2);
      });

      it('should track referral amplitude events with onInstallConversionData', async () => {
        const amplitudeStub = sandbox.stub(amplitude, 'track').resolves();
        const sendData = {
          af_referrer_customer_id: 1,
          af_referrer_name: 'Dave DaBear',
          af_referrer_image_url: 'test',
          appsflyerDeviceId: 'appsflyerId',
          campaign: 'test campaign',
          eventName: 'onInstallConversionData',
        };

        await request(app)
          .post('/v2/campaign_info')
          .set('X-Amplitude-Device-ID', 'amplitudeId')
          .set('X-Device-Id', 'deviceId')
          .send(sendData)
          .expect(200);

        expect(amplitudeStub.firstCall.args[0]).to.deep.equal({
          deviceId: 'amplitudeId',
          eventType: 'installed from referral',
          eventProperties: {
            referrerId: 1,
            campaign: 'test campaign',
          },
        });

        expect(amplitudeStub.secondCall.args[0]).to.deep.equal({
          userId: 1,
          eventType: 'referred user installed',
        });
      });
    });
  });
});
