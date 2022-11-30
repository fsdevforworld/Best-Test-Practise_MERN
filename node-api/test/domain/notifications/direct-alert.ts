import { expect } from 'chai';
import * as sinon from 'sinon';

import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';

import { Alert } from '../../../src/models';

import * as NotificationDomain from '../../../src/domain/notifications';
import * as analyticsClient from '../../../src/services/analytics/client';

import factory from '../../factories';
import { clean, stubBankTransactionClient, stubLoomisClient, up } from '../../test-helpers';

import {
  advanceFixture,
  alertFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentFixture,
  paymentMethodFixture,
  userFixture,
} from '../../fixtures';

describe('Alerts', () => {
  const sandbox = sinon.createSandbox();

  // clean everything before we start
  let twilioStub: any;
  let sendgridStub: any;

  before(() => clean());

  // insert institution fixtures
  beforeEach(() => {
    twilioStub = sandbox.stub(twilio, 'send').resolves();
    sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
    sandbox.stub(amplitude, 'track').resolves();
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    return up([
      userFixture,
      institutionFixture,
      bankConnectionFixture,
      bankAccountFixture,
      paymentMethodFixture,
      advanceFixture,
      paymentFixture,
      alertFixture,
    ]);
  });

  afterEach(() => clean(sandbox));

  describe('sendSMS', () => {
    it('should not send an alert if the user has unsubscribed', async () => {
      await NotificationDomain.sendSMS(15, 'TEST_ALERT', 123, 'TEST', 'foobar');

      expect(twilioStub).to.have.callCount(0);
    });
  });

  describe('sendDisburseCompleted', () => {
    it('should track analytics', async () => {
      const analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();
      const user = await factory.create('user', {
        firstName: 'David',
        settings: { sms_notifications_enabled: true },
      });
      const advance = await factory.create('advance', { userId: user.id });
      await NotificationDomain.sendDisburseCompleted(advance.id);

      expect(analyticsStub).to.have.callCount(1);
      expect(analyticsStub).to.have.been.calledWith({
        userId: String(user.id),
        event: 'advance disburse completed',
        properties: { amount: advance.amount },
      });
    });
  });

  describe('sendPayment', () => {
    it('should send an alert exactly once', async () => {
      const analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();
      await NotificationDomain.sendPayment(1);
      expect(analyticsStub).to.have.been.calledWith({
        userId: '6',
        event: 'advance payment received',
        properties: {
          amount: '$20.00',
        },
      });
    });
  });

  describe('sendHistorical', () => {
    it('should send an alert exactly once', async () => {
      const message =
        'I just got transaction data from your bank. You can pick back up where you left off: dave.com/m/open';

      await NotificationDomain.sendHistorical(1);
      await NotificationDomain.sendHistorical(1);
      await NotificationDomain.sendHistorical(1);
      expect(twilioStub).to.have.callCount(1);
      expect(twilioStub).to.have.been.calledWith(message);
    });
  });

  describe('sendAdvanceDisbursementFailed', () => {
    it('should send an alert', async () => {
      const analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();

      const advance = await factory.create('advance', {
        paybackDate: '2022-01-01',
      });
      const [user] = await Promise.all([
        advance.getUser(),
        factory.create('advance-tip', {
          advanceId: advance.id,
          amount: 10,
          percent: 5,
        }),
      ]);
      await user.update({ email: 'dave@dave.com' });
      await NotificationDomain.sendAdvanceDisbursementFailed(advance);

      expect(analyticsStub).to.have.been.calledWith({
        userId: String(user.id),
        event: 'advance disburse failed',
        context: {
          traits: {
            'advance amount': 75,
            'advance due date': '2022-01-01',
            'advance fee': 0,
            'advance outstanding': 75,
            'advance payback url': sinon.match.string,
            'advance tip': 10,
            'advance tip percent': 5,
          },
        },
      });
    });

    it('should fail silently if the user is deleted', async () => {
      const analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();
      const advance = await factory.create('advance');
      await factory.create('advance-tip', { advanceId: advance.id });
      const user = await advance.getUser();
      await user.destroy();

      await NotificationDomain.sendAdvanceDisbursementFailed(advance);
      expect(analyticsStub).to.have.callCount(0);
    });
  });

  describe('sendAdvancePaymentForm', () => {
    it('should create an alert and send a email via braze', async () => {
      const advance = await factory.create('advance');
      const brazeTrackSpy = sandbox.stub(braze, 'track');
      const brazeTriggerCampaignSpy = sandbox.stub(braze, 'triggerCampaign');

      await NotificationDomain.sendAdvancePaymentForm(advance);

      sinon.assert.calledOnce(brazeTrackSpy);
      sinon.assert.calledOnce(brazeTriggerCampaignSpy);

      const alert = await Alert.findOne({ where: { userId: advance.userId } });
      expect(alert.eventUuid).to.equal(advance.id.toString());
      expect(alert.eventType).to.equal('advance');
    });
  });

  describe('sendAdvancePaymentFailed', () => {
    it('should send an alert', async () => {
      const message =
        "Something went wrong with your payment. I'll continue to try and collect, but you can do it yourself here: dave.com/m/payment";

      const user = await factory.create('user', {
        settings: { sms_notifications_enabled: true },
        email: 'dave@dave.com',
      });
      const advance = await factory.create('advance', { userId: user.id });
      await factory.create('advance-tip', { advanceId: advance.id });
      await NotificationDomain.sendAdvancePaymentFailed(advance);

      expect(twilioStub).to.have.callCount(1);
      expect(twilioStub).to.have.been.calledWith(message);

      expect(sendgridStub).to.have.callCount(1);
      expect(sendgridStub).to.have.been.calledWith(
        undefined,
        'd-d7a2e81b800a4624b33c43e8d3461d8a',
        {},
      );
    });

    it('should not send an email if email is null', async () => {
      const message =
        "Something went wrong with your payment. I'll continue to try and collect, but you can do it yourself here: dave.com/m/payment";

      const user = await factory.create('user', { email: null });
      const advance = await factory.create('advance', { userId: user.id });
      await factory.create('advance-tip', { advanceId: advance.id });
      await NotificationDomain.sendAdvancePaymentFailed(advance);

      expect(twilioStub).to.have.callCount(1);
      expect(twilioStub).to.have.been.calledWith(message);

      expect(sendgridStub).to.have.callCount(0);
    });

    it('should fail silently if the user is deleted', async () => {
      const advance = await factory.create('advance');
      await factory.create('advance-tip', { advanceId: advance.id });
      const user = await advance.getUser();
      await user.destroy();

      await NotificationDomain.sendAdvancePaymentFailed(advance);

      expect(twilioStub).to.have.callCount(0);
      expect(sendgridStub).to.have.callCount(0);
    });
  });
});
