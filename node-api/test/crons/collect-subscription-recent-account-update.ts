import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { Moment } from 'moment';
import * as Task from '../../src/crons/collect-subscription-recent-account-update';
import * as Tasks from '../../src/jobs/data';
import { moment } from '@dave-inc/time-lib';
import factory from '../factories';
import { clean } from '../test-helpers';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';

describe('collect-subscription-recent-account-update', () => {
  const sandbox = sinon.createSandbox();
  let collectStub: SinonStub;

  before(() => clean());

  beforeEach(() => {
    collectStub = sandbox.stub(Tasks, 'collectPastDueSubscriptionTask');
  });

  afterEach(() => clean(sandbox));

  async function getScenario({
    amount,
    dueDate,
    existingPaymentStatus,
    lastPull = moment(),
  }: {
    amount: number;
    dueDate: Moment;
    existingPaymentStatus?: ExternalTransactionStatus;
    lastPull?: Moment;
  }) {
    const billing = await factory.create('subscription-billing', {
      amount,
      dueDate,
      billingCycle: dueDate.format('YYYY-MM'),
    });

    const bankConnectionPromise = factory.create('bank-connection', {
      userId: billing.userId,
      lastPull,
    });

    if (existingPaymentStatus) {
      const payment = await factory.create('subscription-payment', {
        status: existingPaymentStatus,
      });

      await billing.addSubscriptionPayment(payment);
    }
    await bankConnectionPromise;

    return billing;
  }

  describe('run', () => {
    it('enqueues past due subscription collection jobs', async () => {
      const billing = await getScenario({
        amount: 1,
        dueDate: moment().subtract(3, 'days'),
      });
      const billing2 = await getScenario({
        amount: 1,
        dueDate: moment().subtract(5, 'days'),
      });
      const billing3 = await getScenario({
        amount: 1,
        dueDate: moment().subtract(10, 'days'),
        existingPaymentStatus: ExternalTransactionStatus.Canceled,
      });

      await Task.run();

      expect(collectStub.callCount).to.equal(3);

      const [job] = collectStub.firstCall.args;
      expect(job.userId).to.equal(billing.userId);
      expect(job.trigger).to.equal('past_due_recent_account_update');

      const [job2] = collectStub.secondCall.args;
      expect(job2.userId).to.equal(billing2.userId);
      expect(job2.trigger).to.equal('past_due_recent_account_update');

      const [job3] = collectStub.thirdCall.args;
      expect(job3.userId).to.equal(billing3.userId);
      expect(job3.trigger).to.equal('past_due_recent_account_update');
    });

    it('does not enqueue paid billings', async () => {
      await Promise.all([
        getScenario({
          amount: 1,
          dueDate: moment().subtract(1, 'day'),
          existingPaymentStatus: ExternalTransactionStatus.Completed,
        }),
        getScenario({
          amount: 1,
          dueDate: moment().subtract(2, 'day'),
          existingPaymentStatus: ExternalTransactionStatus.Pending,
        }),
      ]);

      await Task.run();
      expect(collectStub.callCount).to.equal(0);
    });

    it('does not enqueue billings for FREE months', async () => {
      await getScenario({
        amount: 0,
        dueDate: moment().subtract(1, 'day'),
      });

      await Task.run();
      expect(collectStub.callCount).to.equal(0);
    });

    it('does not enqueue billings not due yet', async () => {
      await getScenario({
        amount: 1,
        dueDate: moment().add(2, 'days'),
      });

      await Task.run();
      expect(collectStub.callCount).to.equal(0);
    });

    it('does not enqueue bank connections not updated in the last 24 hours', async () => {
      await getScenario({
        amount: 1,
        dueDate: moment().subtract(1, 'day'),
        lastPull: moment().subtract(25, 'hours'),
      });

      await Task.run();
      expect(collectStub.callCount).to.equal(0);
    });
  });
});
