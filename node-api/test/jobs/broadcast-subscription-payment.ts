import * as sinon from 'sinon';
import { expect } from 'chai';
import { clean, replayHttp } from '../test-helpers';
import factory from '../factories';
import { moment } from '@dave-inc/time-lib';
import { Job } from 'bull';
import { BroadcastSubscriptionPayment } from '../../src/jobs';
import braze from '../../src/lib/braze';
import { SubscriptionPayment } from '../../src/models';
import amplitude from '../../src/lib/amplitude';

const FILE_PATH = '../fixtures/jobs/broadcast-subscription-payment';

describe('Job: broadcast-subscription-payment', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  let user;
  let billing;
  let subPayment: SubscriptionPayment;
  beforeEach(async () => {
    user = await factory.create('user', { id: 1 });

    [billing, subPayment] = await Promise.all([
      factory.create('subscription-billing', {
        billingCycle: '2018-10',
        userId: user.id,
      }),
      factory.create('subscription-payment', {
        amount: 1,
        created: moment('2018-10-22'),
      }),
    ]);

    await Promise.all([
      factory.create('subscription-collection-attempt', {
        subscriptionBillingId: billing.id,
        subscriptionPaymentId: subPayment.id,
        trigger: 'test',
      }),
      billing.addSubscriptionPayment(subPayment),
      subPayment.update({ userId: user.id }),
    ]);
  });

  it(
    'sends an event to Braze',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const job = { data: { subscriptionPaymentId: subPayment.id } } as Job;
      const spy = sandbox.spy(braze, 'track');

      await BroadcastSubscriptionPayment.process(job);
      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body).to.deep.equal({
        message: 'success',
        purchases_processed: 1,
      });
    }),
  );

  it(
    'sends a revenue event to Amplitude',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const job = { data: { subscriptionPaymentId: subPayment.id } } as Job;
      const spy = sandbox.spy(amplitude, 'track');

      await BroadcastSubscriptionPayment.process(job);

      sinon.assert.calledOnce(spy);
    }),
  );
});
