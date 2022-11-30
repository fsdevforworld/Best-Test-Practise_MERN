import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';
import pubsub from '../../src/lib/pubsub';
import Task from '../../src/publishers/publish-collect-subscription/task';
import factory from '../factories';
import { clean } from '../test-helpers';

describe('PublishCollectSubscription Task', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  const topic = 'collect-subscription';

  it('enqueues a job for unpaid billings that are due on the date', async () => {
    const [billing, billing2, billing3] = await Promise.all([
      createSubscriptionScenario('2019-07-01', 1),
      createSubscriptionScenario('2019-07-01', 1),
      createSubscriptionScenario('2019-07-01', 1),
      createSubscriptionScenario('2019-06-30', 1),
    ]);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.calledThrice(pubsubPublishSpy);
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing.id,
      forceDebitOnly: false,
    });
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing2.id,
      forceDebitOnly: false,
    });
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing3.id,
      forceDebitOnly: false,
    });
  });

  it('enqueues a job for billings that are due on the date and have CANCELED payments', async () => {
    const [billing, billing2, billing3] = await Promise.all([
      createSubscriptionScenario('2019-07-01', 1, ExternalTransactionStatus.Canceled),
      createSubscriptionScenario('2019-07-01', 2, ExternalTransactionStatus.Canceled),
      createSubscriptionScenario('2019-07-01', 3, ExternalTransactionStatus.Canceled),
    ]);

    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.calledThrice(pubsubPublishSpy);
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing.id,
      forceDebitOnly: false,
    });
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing2.id,
      forceDebitOnly: false,
    });
    sinon.assert.calledWith(pubsubPublishSpy, topic, {
      subscriptionBillingId: billing3.id,
      forceDebitOnly: false,
    });
  });

  it('does not equeue a job for billings that are for free months', async () => {
    await createSubscriptionScenario('2019-07-01', 0);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });

  it('does not equeue a job for billings that are not due on the date specified', async () => {
    await Promise.all([
      createSubscriptionScenario('2019-07-01', 1),
      createSubscriptionScenario('2019-08-01', 1),
    ]);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-11');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });

  it('does not enqueue a job for paid billings that have a COMPLETED payment', async () => {
    await createSubscriptionScenario('2019-07-01', 1, ExternalTransactionStatus.Completed);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });

  it('does not enqueue a job for billings that have a PENDING payment', async () => {
    await createSubscriptionScenario('2019-07-01', 1, ExternalTransactionStatus.Pending);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });

  it('does not enqueue a job for billings that have an UNKNOWN payment', async () => {
    await createSubscriptionScenario('2019-07-01', 1, ExternalTransactionStatus.Unknown);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });

  it('does not enqueue a job for billings that have a CHARGEBACK payment', async () => {
    await createSubscriptionScenario('2019-07-01', 1, ExternalTransactionStatus.Chargeback);
    const pubsubPublishSpy = sandbox.spy(pubsub, 'publish');

    const task = new Task('2019-07-01');
    await task.run();

    sinon.assert.notCalled(pubsubPublishSpy);
  });
});

async function createSubscriptionScenario(
  dueDate: string,
  amount: number,
  existingPaymentStatus?: ExternalTransactionStatus,
) {
  const billing = await factory.create('subscription-billing', {
    dueDate,
    amount,
  });
  if (existingPaymentStatus) {
    const payment = await factory.create('subscription-payment', {
      status: existingPaymentStatus,
    });
    await billing.addSubscriptionPayment(payment);
  }
  return billing;
}
