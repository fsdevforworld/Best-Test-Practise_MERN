import * as sinon from 'sinon';
import { expect } from 'chai';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

import factory from '../factories';
import { clean } from '../test-helpers';
import { run } from '../../src/crons/update-pending-subscription-payments';
import * as TaskCreators from '../../src/jobs/data';

describe('job: update-pending-subscription-payments', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('It should retreive PENDING subscription payments and enqueue all payment IDs', async () => {
    const subscriptionPaymentsTaskCreatorSpy = sandbox.stub(
      TaskCreators,
      'createUpdatePendingSubscriptionPaymentTask',
    );

    await factory.createMany('subscription-payment', 5, {
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      externalProcessor: null,
    });

    await run();

    expect(subscriptionPaymentsTaskCreatorSpy.callCount).to.equal(5);
  });
});
