import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';

import * as SubscriptionBillingHelper from '../../src/helper/subscription-billing';

import { setSubscriptionDueDate } from '../../src/jobs/handlers';
import { moment } from '@dave-inc/time-lib';

import { clean } from '../test-helpers';

describe('Set Subscription Due Date Task', () => {
  const sandbox = sinon.createSandbox();

  let setDueDateSpy: sinon.SinonSpy;

  before(() => clean());

  beforeEach(() => {
    setDueDateSpy = sandbox.spy(SubscriptionBillingHelper, 'setDueDate');
  });
  afterEach(() => clean(sandbox));

  context('Cloud Tasks', () => {
    it('assigns a due date to the subscription billing', async () => {
      const billing = await factory.create('subscription-billing', {
        dueDate: null,
      });

      await setSubscriptionDueDate({ subscriptionBillingId: billing.id });

      sinon.assert.calledOnce(setDueDateSpy);
      sinon.assert.calledWith(setDueDateSpy, sinon.match({ id: billing.id }));

      await billing.reload();

      expect(billing.dueDate.isSameOrAfter(billing.start)).to.equal(true);
      expect(billing.dueDate.isSameOrBefore(billing.end)).to.equal(true);
    });

    it('throws an error when billing record cannot be found', async () => {
      let errorThrown: Error;

      try {
        await setSubscriptionDueDate({ subscriptionBillingId: 8432412132423 });
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).to.exist;
      sinon.assert.notCalled(setDueDateSpy);
    });

    it('silently fails if due date is already set', async () => {
      const billing = await factory.create('subscription-billing', {
        dueDate: moment(),
      });

      await setSubscriptionDueDate({ subscriptionBillingId: billing.id });

      sinon.assert.notCalled(setDueDateSpy);
    });

    it('gracefully fails if due date errors out', async () => {
      const billing = await factory.create('subscription-billing', {
        dueDate: null,
      });

      setDueDateSpy.restore();
      sandbox.stub(SubscriptionBillingHelper, 'setDueDate').throws(new Error('no thanks'));

      await setSubscriptionDueDate({ subscriptionBillingId: billing.id });
    });
  });
});
