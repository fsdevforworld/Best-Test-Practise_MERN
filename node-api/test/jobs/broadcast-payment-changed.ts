import * as sinon from 'sinon';
import { clean } from '../test-helpers';
import factory from '../factories';
import { moment } from '@dave-inc/time-lib';
import braze from '../../src/lib/braze';
import { broadcastPaymentChanged } from '../../src/jobs/handlers';
import { BroadcastPaymentChangedData } from '../../src/jobs/handlers/broadcast-payment-changed';
import { expect } from 'chai';
import amplitude from '../../src/lib/amplitude';
import { AnalyticsUserProperty } from '../../src/typings';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('Job: broadcast-payment-changed', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  it('sends a track request to Braze', async () => {
    const user = await factory.create('user', { id: 1 });
    const advance = await factory.create('advance', {
      id: 1,
      userId: user.id,
      paybackDate: '2019-11-01',
    });
    const [payment] = await Promise.all([
      factory.create('payment', {
        id: 1,
        amount: 50,
        created: moment('2018-09-18'),
        advanceId: advance.id,
        userId: user.id,
        status: ExternalTransactionStatus.Returned,
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
    ]);

    const data = { paymentId: payment.id, time: '2018-11-01' } as BroadcastPaymentChangedData;

    const stub = sandbox.stub(braze, 'track');

    await broadcastPaymentChanged(data);
    sinon.assert.calledOnce(stub);

    expect(stub.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
      '2019-11-01',
    );
  });

  it('updates the advance due date property', async () => {
    const user = await factory.create('user', { id: 1 });
    const advance = await factory.create('advance', {
      id: 1,
      paybackDate: '2018-11-01',
      outstanding: 50,
      userId: user.id,
    });
    const [payment] = await Promise.all([
      factory.create('payment', {
        id: 1,
        amount: 50,
        created: moment('2018-09-18'),
        advanceId: advance.id,
        userId: user.id,
        status: ExternalTransactionStatus.Canceled,
        updated: moment('2018-11-01'),
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
    ]);

    const data = { paymentId: payment.id, time: '2018-11-01' } as BroadcastPaymentChangedData;

    const stub = sandbox.stub(braze, 'track');

    await broadcastPaymentChanged(data);

    expect(stub.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
      '2018-11-01',
    );
  });

  it('sends a revenue event to Amplitude', async () => {
    const user = await factory.create('user', { id: 1 });
    const advance = await factory.create('advance', {
      id: 1,
      userId: user.id,
      paybackDate: '2019-11-01',
    });
    const [payment] = await Promise.all([
      factory.create('payment', {
        amount: 50,
        created: moment('2018-09-18'),
        userId: advance.id,
        advanceId: user.id,
        status: ExternalTransactionStatus.Returned,
        updated: moment('2018-11-01'),
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
    ]);

    const data = { paymentId: payment.id, time: '2018-11-01' } as BroadcastPaymentChangedData;

    const spy = sandbox.spy(amplitude, 'track');
    const stub = sandbox.stub(braze, 'track');

    await broadcastPaymentChanged(data);

    expect(stub.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
      '2019-11-01',
    );
    sinon.assert.calledOnce(spy);
  });

  it('sends an identity event to Amplitude', async () => {
    const user = await factory.create('user', { id: 1 });
    const advance = await factory.create('advance', {
      id: 1,
      userId: user.id,
      paybackDate: '2019-11-01',
    });
    const [payment] = await Promise.all([
      factory.create('payment', {
        amount: 50,
        created: moment('2018-09-18'),
        userId: user.id,
        advanceId: advance.id,
        status: ExternalTransactionStatus.Returned,
        updated: moment('2018-11-01'),
      }),
      factory.create('advance-tip', { advanceId: advance.id }),
    ]);

    const data = { paymentId: payment.id, time: '2018-11-01' } as BroadcastPaymentChangedData;

    const spy = sandbox.spy(amplitude, 'identify');
    const stub = sandbox.stub(braze, 'track');

    await broadcastPaymentChanged(data);

    expect(stub.firstCall.args[0].attributes[0][AnalyticsUserProperty.AdvanceDueDate]).to.equal(
      '2019-11-01',
    );
    sinon.assert.calledOnce(spy);
  });
});
