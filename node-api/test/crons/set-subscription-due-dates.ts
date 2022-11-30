import * as sinon from 'sinon';

import { clean } from '../test-helpers';
import factory from '../factories';
import { moment } from '@dave-inc/time-lib';
import * as SetSubscriptionDueDatesTask from '../../src/crons/set-subscription-due-dates';
import * as Jobs from '../../src/jobs/data';
import { SubscriptionBilling } from '../../src/models';

describe('SetSubscriptionDueDatesTask', () => {
  const sandbox = sinon.createSandbox();

  let createTaskStub: sinon.SinonStub;

  before(() => clean(sandbox));
  beforeEach(() => {
    createTaskStub = sandbox.stub(Jobs, 'createSetSubscriptionDueDateTask');
  });
  afterEach(() => clean(sandbox));

  it('queues jobs for subscription billings with no due date', async () => {
    const billings = await factory.createMany<SubscriptionBilling>('subscription-billing', 50, {
      billingCycle: '2018-07',
      start: moment('2018-07-01'),
      end: moment('2018-07-31'),
      dueDate: null,
      amount: 1,
      created: moment().subtract(30, 'minutes'),
    });

    await SetSubscriptionDueDatesTask.run({ billingCycle: '2018-07', batchSize: 10 });

    sinon.assert.callCount(createTaskStub, billings.length);
    billings.forEach(billing => {
      sinon.assert.calledWith(createTaskStub, { subscriptionBillingId: billing.id });
    });
  });

  it('does not queue a job for subscriptions that already have a due date', async () => {
    await factory.create('subscription-billing', {
      billingCycle: '2018-07',
      start: moment('2018-07-01'),
      end: moment('2018-07-31'),
      dueDate: '2018-07-06',
      amount: 1,
      created: moment().subtract(30, 'minutes'),
    });

    await SetSubscriptionDueDatesTask.run({ billingCycle: '2018-07' });

    sinon.assert.notCalled(createTaskStub);
  });

  it('does not queue a job for free billings', async () => {
    await factory.create('subscription-billing', {
      billingCycle: '2018-07',
      start: moment('2018-07-01'),
      end: moment('2018-07-31'),
      dueDate: null,
      amount: 0,
      created: moment().subtract(30, 'minutes'),
    });

    await SetSubscriptionDueDatesTask.run({ billingCycle: '2018-07' });

    sinon.assert.notCalled(createTaskStub);
  });

  it('does not queue a job for billings that are not in the billing cycle', async () => {
    await factory.create('subscription-billing', {
      billingCycle: '2018-07',
      start: moment('2018-07-01'),
      end: moment('2018-07-31'),
      dueDate: null,
      amount: 1,
    });

    await SetSubscriptionDueDatesTask.run({ billingCycle: '2018-08' });

    sinon.assert.notCalled(createTaskStub);
  });

  it('does not queue a job for billings created after the cutoffTime', async () => {
    const cutoffTime = moment('2018-07-06 12:00');

    await factory.create('subscription-billing', {
      billingCycle: '2018-07',
      start: moment('2018-07-01'),
      end: moment('2018-07-31'),
      dueDate: null,
      amount: 1,
      created: cutoffTime.clone().add(5, 'minutes'),
    });

    await SetSubscriptionDueDatesTask.run({ billingCycle: '2018-07', cutoffTime });

    sinon.assert.notCalled(createTaskStub);
  });
});
