import { DEFAULT_TIMEZONE, moment, Moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { expect } from 'chai';
import factory from '../../factories';
import { clean, fakeDateTime, replayHttp } from '../../test-helpers';
import { broadcastAdvanceDisbursement } from '../../../src/jobs/handlers';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import {
  Advance,
  AdvanceExperiment,
  AdvanceTip,
  Institution,
  PaymentMethod,
} from '../../../src/models';
import { AnalyticsEvent, BrazeCurrency, Platforms } from '../../../src/typings';

const FILE_PATH = 'jobs/broadcast-advance-disbursement';

describe('Job: broadcast-advance-disbursement', () => {
  const sandbox = sinon.createSandbox();
  const ip = 'some.ip';
  const appsflyerDeviceId = 'some-appflyer-id';
  const platform = Platforms.Android;
  const userId = 1;

  let institution: Institution;
  let advance: Advance;
  let paymentMethod: PaymentMethod;
  let advanceTip: AdvanceTip;
  let now: Moment;

  before(() => clean());

  beforeEach(async () => {
    now = moment('2020-07-06T23:53:36Z');
    fakeDateTime(sandbox, now);
    const [, factoryInstitution] = await Promise.all([
      factory.create('user', { id: userId }),
      factory.create('institution', {
        displayName: 'bank of pep',
      }),
    ]);
    institution = factoryInstitution;

    const bankConnection = await factory.create('bank-connection', {
      institutionId: institution.id,
      userId,
    });
    const bankAccount = await factory.create('bank-account', {
      userId,
      bankConnectionId: bankConnection.id,
      institutionId: institution.id,
    });

    paymentMethod = await factory.create('payment-method', {
      id: 1,
      userId,
    });
    advance = await factory.create('advance', {
      id: 1,
      amount: 75,
      fee: 4.99,
      paybackDate: '2018-09-20',
      created: moment('2018-09-18'),
      userId: 1,
      bankAccountId: bankAccount.id,
      paymentMethodId: paymentMethod.id,
    });

    advanceTip = await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 2,
      percent: 2.66,
    });
  });

  afterEach(() => clean(sandbox));

  it(
    'sends a track request to Braze',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.events_processed).to.equal(1);
    }),
  );

  it(
    'sends two purchase events to Braze for express + tip advance',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });
      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.purchases_processed).to.equal(2);
    }),
  );

  it(
    'sends one purchase event to Braze for express + no tip advance ',
    replayHttp(`${FILE_PATH}/express-purchase-success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await advanceTip.update({ amount: 0 });
      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.purchases_processed).to.equal(1);
    }),
  );
  it(
    'sends one purchase event to Braze for standard + tip advance ',
    replayHttp(`${FILE_PATH}/tip-purchase-success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await advance.update({ fee: 0 });
      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.purchases_processed).to.equal(1);
    }),
  );

  it(
    'sends no purchase event to Braze standard + no tip advance ',
    replayHttp(`${FILE_PATH}/no-purchase-success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await advance.update({ fee: 0 });
      await advanceTip.update({ amount: 0 });
      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.purchases_processed).to.equal(undefined);
    }),
  );

  it(
    "updates the user's due date in Braze",
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body.attributes_processed).to.equal(1);
    }),
  );

  it(
    'sends a revenue event to Amplitude',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const spy = sandbox.spy(amplitude, 'track');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);
    }),
  );

  it(
    'sends an identity event to Amplitude',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const spy = sandbox.spy(amplitude, 'identify');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      sinon.assert.calledOnce(spy);
    }),
  );

  it(
    'sends braze purchase event with experimental set to false when no experiment is logged',
    replayHttp(`${FILE_PATH}/without-experiment.json`, async () => {
      const brazeTrackStub = sandbox.stub(braze, 'track');

      const bankAccount = await advance.getBankAccount({ include: [Institution] });

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      const purchase = {
        externalId: `${advance.userId}`,
        currency: BrazeCurrency.USA,
        time: sinon.match.any,
        properties: {
          advanceId: advance.id,
          amount: advance.amount,
          createdWithOffset: advance.created
            .clone()
            .tz(DEFAULT_TIMEZONE)
            .format(),
          paybackDate: advance.paybackDate.format('YYYY-MM-DD'),
          deliveryFee: advance.fee,
          tipAmount: advanceTip.amount,
          paymentMethodLastFour: paymentMethod.mask,
          institutionName: bankAccount.institution.displayName,
          isExperimental: false,
          experimentName: '',
        },
      };

      sinon.assert.calledWith(
        brazeTrackStub,
        sinon.match({
          purchases: [
            sinon.match({
              ...purchase,
              productId: AnalyticsEvent.AdvanceTipSet,
              price: advanceTip.amount,
            }),
            sinon.match({
              ...purchase,
              productId: AnalyticsEvent.AdvanceExpressSet,
              price: advance.fee,
            }),
          ],
        }),
      );
    }),
  );

  it(
    'sends braze purchase event with experimental set to true when an experiment is logged',
    replayHttp(`${FILE_PATH}/with-experiment.json`, async () => {
      const brazeTrackStub = sandbox.stub(braze, 'track');

      const advanceExperiment = await factory.create<AdvanceExperiment>('advance-experiment');

      const [, bankAccount] = await Promise.all([
        await factory.create('advance-experiment-log', {
          userId: advance.userId,
          bankAccountId: advance.bankAccountId,
          advanceId: advance.id,
          advanceExperimentId: advanceExperiment.id,
          success: true,
        }),
        await advance.getBankAccount({ include: [Institution] }),
      ]);

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId,
        ip,
        platform,
      });

      const purchase = {
        externalId: `${advance.userId}`,
        currency: BrazeCurrency.USA,
        time: sinon.match.any,
        properties: {
          advanceId: advance.id,
          amount: advance.amount,
          createdWithOffset: advance.created
            .clone()
            .tz(DEFAULT_TIMEZONE)
            .format(),
          paybackDate: advance.paybackDate.format('YYYY-MM-DD'),
          deliveryFee: advance.fee,
          tipAmount: advanceTip.amount,
          paymentMethodLastFour: paymentMethod.mask,
          institutionName: bankAccount.institution.displayName,
          isExperimental: true,
          experimentName: advanceExperiment.name,
        },
      };

      sinon.assert.calledWith(
        brazeTrackStub,
        sinon.match({
          purchases: [
            sinon.match({
              ...purchase,
              productId: AnalyticsEvent.AdvanceTipSet,
              price: advanceTip.amount,
            }),
            sinon.match({
              ...purchase,
              productId: AnalyticsEvent.AdvanceExpressSet,
              price: advance.fee,
            }),
          ],
        }),
      );
    }),
  );

  context('when there is no paymentMethod associated with the advance', () => {
    it('sends undefined for paymentMethodLastFour to Braze and Amplitude', async () => {
      advance = await factory.create('advance', { paymentMethodId: null });
      await factory.create('advance-tip', { advanceId: advance.id });

      const brazeTrackStub = sandbox.stub(braze, 'track').resolves();
      sandbox.stub(amplitude, 'track');
      sandbox.stub(amplitude, 'identify');

      await broadcastAdvanceDisbursement({
        userId,
        advanceId: advance.id,
        appsflyerDeviceId: null,
        ip,
        platform,
      });

      const paymentMethodMask =
        brazeTrackStub.firstCall.args[0].purchases[0].properties.paymentMethodLastFour;
      expect(paymentMethodMask).to.eq(undefined);
    });
  });
});
