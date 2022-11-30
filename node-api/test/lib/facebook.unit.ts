import { expect } from 'chai';
import * as sinon from 'sinon';

import * as facebook from '../../src/lib/facebook';
import { AppsFlyerEvents } from '../../src/lib/appsflyer';
import * as Utils from '../../src/lib/utils';
// tslint:disable-next-line:no-require-imports
import bizSdk = require('facebook-nodejs-business-sdk');

describe('Facebook', () => {
  const sandbox = sinon.createSandbox();
  let createEventStub: sinon.SinonStub;

  beforeEach(() => {
    createEventStub = sandbox
      .stub(bizSdk.AdsPixel.prototype, 'createEvent')
      .resolves(Promise.resolve());
    sandbox.stub(Utils, 'isTestEnv').returns(false);
  });

  afterEach(() => sandbox.restore());

  describe('track', async () => {
    it('Should track AppsFlyer whitelisted event', async () => {
      await facebook.track({
        event_name: AppsFlyerEvents.ADVANCE_DISBURSED,
        user_data: { external_id: '1' },
      });

      expect(createEventStub.callCount).to.eq(1);
    });

    it('Should not track AppsFlyer blacklisted event', async () => {
      await facebook.track({
        event_name: AppsFlyerEvents.DAVE_CHECKING_ACCOUNT_READY,
        user_data: { external_id: '1' },
      });

      expect(createEventStub.callCount).to.eq(0);
    });
  });
});
