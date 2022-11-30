import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, replayHttp } from '../../test-helpers';
import { broadcastAdvancePayment } from '../../../src/jobs/handlers';
import amplitude from '../../../src/lib/amplitude';
import braze from '../../../src/lib/braze';
import { AdvanceTip, User } from '../../../src/models';
import { AnalyticsUserProperty } from '../../../src/typings';

const FILE_PATH = 'jobs/broadcast-advance-payment';

describe('Job: broadcast-advance-payment', () => {
  const sandbox = sinon.createSandbox();
  let user: User;
  before(() => clean());

  beforeEach(async () => {
    user = await factory.create('user', { id: 1 });
  });

  afterEach(() => clean(sandbox));

  it(
    'sends a track request to Braze',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const advance = await factory.create('advance', {
        id: 1,
        userId: user.id,
        paybackDate: '2018-11-01',
      });
      const [payment] = await Promise.all([
        factory.create('payment', {
          id: 1,
          amount: 50,
          created: moment('2018-09-18'),
          advanceId: advance.id,
          userId: user.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvancePayment({ paymentId: payment.id });

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body).to.deep.equal({
        message: 'success',
        attributes_processed: 1,
        events_processed: 1,
      });
    }),
  );

  it(
    'updates the advance due date property',
    replayHttp(`${FILE_PATH}/new-advance-due-date.json`, async () => {
      const [advance1, advance2] = await Promise.all([
        factory.create('advance', {
          id: 1,
          paybackDate: '2018-11-01',
          outstanding: 0,
          userId: user.id,
        }),
        factory.create('advance', {
          id: 2,
          paybackDate: '2018-10-10',
          outstanding: 50,
          userId: user.id,
          createdDate: '2018-10-01',
        }),
      ]);

      const [payment] = await Promise.all([
        factory.create('payment', {
          id: 1,
          amount: 50,
          created: moment('2018-09-18'),
          advanceId: advance1.id,
          userId: user.id,
        }),
        factory.create('advance-tip', { advanceId: advance1.id, amount: 0, percent: 0 }),
        factory.create('advance-tip', { advanceId: advance2.id, amount: 0, percent: 0 }),
      ]);

      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvancePayment({ paymentId: payment.id });

      expect(spy.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
        '2018-10-10',
      );
      expect(
        spy.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceOutstanding],
      ).to.equal(50);
    }),
  );

  it(
    'clears the advance due date property when all advances are paid',
    replayHttp(`${FILE_PATH}/clear-advance-due-date.json`, async () => {
      const [advance1, advance2] = await Promise.all([
        factory.create('advance', {
          id: 1,
          paybackDate: '2018-11-01',
          outstanding: 0,
          userId: user.id,
        }),
        factory.create('advance', {
          paybackDate: '2018-10-10',
          outstanding: 0,
          userId: user.id,
          createdDate: '2018-10-01',
        }),
      ]);

      const [payment] = await Promise.all([
        factory.create('payment', {
          id: 1,
          amount: 50,
          created: moment('2018-09-18'),
          advanceId: 1,
          userId: 1,
        }),
        factory.create<AdvanceTip>('advance-tip', {
          advanceId: advance1.id,
          amount: 0,
          percent: 0,
        }),
        factory.create<AdvanceTip>('advance-tip', {
          advanceId: advance2.id,
          amount: 0,
          percent: 0,
        }),
      ]);

      const spy = sandbox.spy(braze, 'track');

      await broadcastAdvancePayment({ paymentId: payment.id });

      expect(spy.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
        null,
      );
    }),
  );

  it(
    'sends identity and revenue events to Amplitude',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const advance = await factory.create('advance', {
        id: 1,
        userId: user.id,
        paybackDate: '2018-11-01',
      });
      const [payment] = await Promise.all([
        factory.create('payment', {
          amount: 50,
          created: moment('2018-09-18'),
          userId: user.id,
          advanceId: advance.id,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const trackSpy = sandbox.spy(amplitude, 'track');
      const identifySpy = sandbox.spy(amplitude, 'identify');

      await broadcastAdvancePayment({ paymentId: payment.id });
      sinon.assert.calledOnce(trackSpy);
      sinon.assert.calledOnce(identifySpy);
    }),
  );
});
