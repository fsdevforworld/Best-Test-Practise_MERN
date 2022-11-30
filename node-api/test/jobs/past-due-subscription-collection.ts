import * as sinon from 'sinon';
import CollectSubscriptionTask from '../../src/consumers/subscription-payment-processor/task';
import { SUBSCRIPTION_COLLECTION_TRIGGER } from '../../src/domain/collection';
import { collectPastDueSubscription } from '../../src/jobs/handlers/past-due-subscription-collection';
import { moment, Moment } from '@dave-inc/time-lib';
import factory from '../factories';

describe('Past Due Subscription Collection', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  const getBillProperties = (dueDate: Moment = moment().subtract(1, 'day')) => ({
    billingCycle: moment().format('YYYY-MM'),
    dueDate,
  });

  it('runs the subscription collection task', async () => {
    const { dueDate, billingCycle } = getBillProperties();
    const billing = await factory.create('subscription-billing', {
      amount: 1,
      billingCycle,
      dueDate,
    });

    const bankConnection = await factory.create('bank-connection', { userId: billing.userId });

    const account = await factory.create('checking-account', {
      bankConnectionId: bankConnection,
      current: 5,
      available: 5,
    });

    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      bankAccountId: account.id,
    });

    await account.setDefaultPaymentMethod(debitCard);

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = {
      userId: billing.userId,
      trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
    };

    await collectPastDueSubscription(job);

    sinon.assert.calledOnce(stub);
  });

  it('does not collect on billings due today', async () => {
    const { dueDate, billingCycle } = getBillProperties(moment());
    const billing = await factory.create('subscription-billing', {
      amount: 1,
      billingCycle,
      dueDate,
    });

    const bankConnection = await factory.create('bank-connection', { userId: billing.userId });

    await factory.create('checking-account', {
      bankConnectionId: bankConnection,
      current: 100,
      available: 100,
    });

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = { userId: billing.userId, trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB };

    await collectPastDueSubscription(job);

    sinon.assert.notCalled(stub);
  });

  it('skips when there are no unpaid billings', async () => {
    const account = await factory.create('checking-account', {
      current: 100,
      available: 100,
    });

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = { userId: account.userId, trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB };

    await collectPastDueSubscription(job);

    sinon.assert.notCalled(stub);
  });

  it('skips when there is no account to charge', async () => {
    const { dueDate, billingCycle } = getBillProperties();
    const billing = await factory.create('subscription-billing', {
      amount: 1,
      billingCycle,
      dueDate,
    });

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = { userId: billing.userId, trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB };

    await collectPastDueSubscription(job);

    sinon.assert.notCalled(stub);
  });

  it('skips when the account balance is less than $5', async () => {
    const { dueDate, billingCycle } = getBillProperties();
    const billing = await factory.create('subscription-billing', {
      amount: 1,
      billingCycle,
      dueDate,
    });

    const bankConnection = await factory.create('bank-connection', { userId: billing.userId });

    const account = await factory.create('checking-account', {
      bankConnectionId: bankConnection,
      current: 4.99,
      available: 4.99,
    });

    const debitCard = await factory.create('payment-method', {
      invalid: null,
      invalidReasonCode: null,
      bankAccountId: account.id,
    });

    await account.setDefaultPaymentMethod(debitCard);

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = { userId: billing.userId, trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB };

    await collectPastDueSubscription(job);

    sinon.assert.notCalled(stub);
  });

  it('skips when the account balance is less than $10 and there is no debit card', async () => {
    const { dueDate, billingCycle } = getBillProperties();
    const billing = await factory.create('subscription-billing', {
      amount: 1,
      billingCycle,
      dueDate,
    });

    const bankConnection = await factory.create('bank-connection', { userId: billing.userId });

    await factory.create('checking-account', {
      bankConnectionId: bankConnection,
      current: 9.99,
      available: 9.99,
    });

    const stub = sandbox.stub(CollectSubscriptionTask.prototype, 'run').resolves();

    const job = { userId: billing.userId, trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB };

    await collectPastDueSubscription(job);

    sinon.assert.notCalled(stub);
  });
});
