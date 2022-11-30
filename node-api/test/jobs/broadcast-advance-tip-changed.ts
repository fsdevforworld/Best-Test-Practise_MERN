import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';
import { clean } from '../test-helpers';
import { broadcastAdvanceTipChanged } from '../../src/jobs/handlers';
import amplitude from '../../src/lib/amplitude';
import * as appsflyer from '../../src/lib/appsflyer';
import braze from '../../src/lib/braze';
import { User } from '../../src/models';
import { Platforms } from '../../src/typings';

describe('Job: broadcast-advance-tip-changed', () => {
  const sandbox = sinon.createSandbox();

  let amplitudeIdentifySpy: sinon.SinonSpy;
  let brazeTrackSpy: sinon.SinonSpy;
  let appsflyerTrackSpy: sinon.SinonSpy;
  let user: User;

  const amount = 2.0;
  const ip = 'ip';
  const appsflyerDeviceId = 'appsflyerDeviceId';
  const platform = Platforms.Android;

  before(() => clean());
  afterEach(() => clean());

  context('when the only advance tip has been changed', () => {
    before(async () => {
      amplitudeIdentifySpy = sandbox.stub(amplitude, 'identify');
      brazeTrackSpy = sandbox.stub(braze, 'track');
      appsflyerTrackSpy = sandbox.stub(appsflyer, 'logAppsflyerEvent');
      user = await factory.create('user', { id: 1 });
      const advance = await factory.create('advance', {
        id: 1,
        userId: user.id,
        paybackDate: '2019-11-01',
        outstanding: 75,
      });
      await factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 });
      await broadcastAdvanceTipChanged({
        advanceId: advance.id,
        amount,
        userId: user.id,
        appsflyerDeviceId,
        ip,
        platform,
      });
    });

    after(() => sandbox.restore());

    it('should update the advance user properties on Braze', async () => {
      expect(brazeTrackSpy).to.be.calledWith({
        attributes: [
          sinon.match({
            'advance amount': 75,
            'advance due date': '2019-11-01',
            'advance fee': 0,
            'advance outstanding': 75,
            'advance payback url': sinon.match.string,
            'advance tip': 0,
            'advance tip percent': 0,
            externalId: '1',
          }),
        ],
      });
    });

    it('should update the advance user properties on Amplitude', () => {
      sinon.assert.calledOnce(amplitudeIdentifySpy);
    });

    it('should update appsflyer revenue', () => {
      sinon.assert.calledOnce(appsflyerTrackSpy);
    });
  });

  context('when the only advance outstanding is zero', () => {
    before(async () => {
      amplitudeIdentifySpy = sandbox.stub(amplitude, 'identify');
      brazeTrackSpy = sandbox.stub(braze, 'track');
      appsflyerTrackSpy = sandbox.stub(appsflyer, 'logAppsflyerEvent');

      const advance = await factory.create('advance', {
        id: 1,
        paybackDate: '2019-11-01',
        outstanding: 0,
      });
      await factory.create('advance-tip', { advanceId: advance.id });
      await broadcastAdvanceTipChanged({
        advanceId: advance.id,
        amount,
        userId: user.id,
        appsflyerDeviceId,
        ip,
        platform,
      });
    });

    after(() => sandbox.restore());

    it('should not update the advance user properties on Braze', async () => {
      sinon.assert.notCalled(brazeTrackSpy);
    });

    it('should not update the advance user properties on Amplitude', () => {
      sinon.assert.notCalled(amplitudeIdentifySpy);
    });

    it('should update appsflyer revenue', () => {
      sinon.assert.notCalled(appsflyerTrackSpy);
    });
  });

  context('when the newest of two advances has had its tip changed', () => {
    before(async () => {
      amplitudeIdentifySpy = sandbox.stub(amplitude, 'identify');
      brazeTrackSpy = sandbox.stub(braze, 'track');
      appsflyerTrackSpy = sandbox.stub(appsflyer, 'logAppsflyerEvent');

      user = await factory.create('user', { id: 1 });
      const bankAccount = await factory.create('checking-account', { id: 1, userId: user.id });
      const [advance1, advance2] = await Promise.all([
        factory.create('advance', {
          id: 1,
          bankAccountId: bankAccount.id,
          userId: user.id,
          paybackDate: '2019-11-01',
          outstanding: 75,
          createdDate: '2018-01-01',
        }),
        factory.create('advance', {
          id: 2,
          bankAccountId: bankAccount.id,
          userId: user.id,
          paybackDate: '2019-12-02',
          outstanding: 75,
          createdDate: '2018-01-02',
        }),
      ]);

      await Promise.all([
        factory.create('advance-tip', {
          advanceId: advance1.id,
        }),
        factory.create('advance-tip', {
          advanceId: advance2.id,
        }),
      ]);

      await broadcastAdvanceTipChanged({
        advanceId: advance2.id,
        amount,
        userId: user.id,
        appsflyerDeviceId,
        ip,
        platform,
      });
    });

    after(() => sandbox.restore());

    it('should not update the advance user properties on Braze', async () => {
      sinon.assert.notCalled(brazeTrackSpy);
    });

    it('should not update the advance user properties on Amplitude', () => {
      sinon.assert.notCalled(amplitudeIdentifySpy);
    });

    it('should update appsflyer revenue', () => {
      sinon.assert.notCalled(appsflyerTrackSpy);
      appsflyerTrackSpy.calledWith(true);
    });
  });

  context('when the oldest of two advances has had its tip changed', () => {
    before(async () => {
      amplitudeIdentifySpy = sandbox.stub(amplitude, 'identify');
      brazeTrackSpy = sandbox.stub(braze, 'track');
      appsflyerTrackSpy = sandbox.stub(appsflyer, 'logAppsflyerEvent');

      user = await factory.create('user', { id: 1 });
      const bankAccount = await factory.create('checking-account', { id: 1, userId: user.id });
      const [advance1, advance2] = await Promise.all([
        factory.create('advance', {
          id: 1,
          bankAccountId: bankAccount.id,
          userId: user.id,
          paybackDate: '2019-11-01',
          outstanding: 75,
          createdDate: '2018-01-01',
        }),
        factory.create('advance', {
          id: 2,
          bankAccountId: bankAccount.id,
          userId: user.id,
          paybackDate: '2019-12-02',
          outstanding: 75,
          createdDate: '2018-01-02',
        }),
      ]);

      await Promise.all([
        factory.create('advance-tip', {
          advanceId: advance1.id,
          amount: 0,
          percent: 0,
        }),
        factory.create('advance-tip', {
          advanceId: advance2.id,
          amount: 0,
          percent: 0,
        }),
      ]);

      await broadcastAdvanceTipChanged({
        advanceId: advance1.id,
        amount,
        userId: user.id,
        appsflyerDeviceId,
        ip,
        platform,
      });
    });

    after(() => sandbox.restore());

    it('should update the advance user properties on Braze', async () => {
      expect(brazeTrackSpy).to.be.calledWith({
        attributes: [
          sinon.match({
            'advance amount': 75,
            'advance due date': '2019-11-01',
            'advance fee': 0,
            'advance outstanding': 75,
            'advance payback url': sinon.match.string,
            'advance tip': 0,
            'advance tip percent': 0,
            externalId: '1',
          }),
        ],
      });
    });

    it('should update the advance user properties on Amplitude', () => {
      sinon.assert.calledOnce(amplitudeIdentifySpy);
    });

    it('should update appsflyer revenue', () => {
      sinon.assert.calledWith(appsflyerTrackSpy, {
        appsflyerDeviceId: 'appsflyerDeviceId',
        eventName: 'advance tip revenue updated',
        eventValue: JSON.stringify({ af_revenue: '2.00' }),
        ip: 'ip',
        platform: 'android',
        userId: 1,
      });
    });
  });
});
