import { expect } from 'chai';
import { moment, Moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { run as runPublisher } from '../../src/crons/publish-subscription-collection-predicted-payday';
import {
  MAX_BILL_AGE_DAYS,
  MAX_BILL_AGE_MONTHS,
} from '../../src/domain/collection/collect-subscription';
import * as Collection from '../../src/domain/collection';
import * as Jobs from '../../src/jobs/data';
import { subscriptionCollectionPredictedPayday } from '../../src/jobs/handlers/subscription-collection-predicted-payday';
import factory from '../factories';
import { clean, fakeDate, stubLoomisClient } from '../test-helpers';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('subscription-collection-predicted-payday', () => {
  const sandbox = sinon.createSandbox();
  let subscriptionCollectionStub: sinon.SinonStub;

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));
  beforeEach(() => {
    subscriptionCollectionStub = sandbox.stub(
      Jobs,
      'createSubscriptionCollectionPredictedPaydayTask',
    );
    stubLoomisClient(sandbox);
  });

  const createPastDueBill = async ({
    dueDate,
    amount = 1,
    missedRecurringTransaction = null,
    isValidRecurringTransaction = true,
    paymentMethodInvalid = false,
    recurringScheduleDay = moment().date(),
  }: {
    dueDate: Moment;
    amount?: number;
    missedRecurringTransaction?: Moment;
    isValidRecurringTransaction?: boolean;
    paymentMethodInvalid?: boolean;
    recurringScheduleDay?: number;
  }) => {
    const bankConnection = await factory.create('bank-connection', {
      hasValidCredentials: false,
    });

    const bankAccount = await factory.create('bank-account', {
      bankConnectionId: bankConnection,
    });

    let recurringTransactionOptions: any = {
      bankAccountId: bankAccount,
      missed: missedRecurringTransaction,
      transactionDisplayName: 'foo bar',
    };

    if (isValidRecurringTransaction) {
      const params = recurringScheduleDay !== undefined ? [recurringScheduleDay] : undefined;
      recurringTransactionOptions = {
        ...recurringTransactionOptions,
        dtstart: moment()
          .startOf('day')
          .subtract(1, 'year'),
        interval: 'MONTHLY',
        params,
      };
    }

    const [recurringTransaction, debitCard, user] = await Promise.all([
      factory.create('recurring-transaction', recurringTransactionOptions),
      factory.create('payment-method', {
        bankAccountId: bankAccount.id,
        invalid: paymentMethodInvalid ? moment() : null,
      }),
      bankAccount.getUser(),
    ]);

    const [billing] = await Promise.all([
      factory.create('subscription-billing', {
        billingCycle: dueDate.format('YYYY-MM'),
        dueDate,
        amount,
        userId: bankAccount.userId,
        start: dueDate.clone().startOf('month'),
        end: dueDate.clone().endOf('month'),
      }),
      bankAccount.update({
        mainPaycheckRecurringTransactionId: recurringTransaction.id,
        defaultPaymentMethodId: debitCard.id,
      }),
      user.update({ defaultBankAccountId: bankAccount.id }),
    ]);

    return { bankAccount, billing, user, debitCard, recurringTransaction };
  };

  it('enqueues collection jobs', async () => {
    fakeDate(sandbox, '2019-11-03');
    const { billing, bankAccount, recurringTransaction } = await createPastDueBill({
      dueDate: moment().subtract(1, 'day'),
    });

    await runPublisher();

    sinon.assert.calledOnce(subscriptionCollectionStub);
    expect(subscriptionCollectionStub.firstCall.args[0]).to.deep.eq({
      subscriptionBillingId: billing.id,
      bankAccountId: bankAccount.id,
      recurringTransactionId: recurringTransaction.id,
    });
  });

  it(`only collects bills no older than one month`, async () => {
    fakeDate(sandbox, '2019-10-01');

    const [{ billing, bankAccount, recurringTransaction }] = await Promise.all([
      createPastDueBill({
        dueDate: moment()
          .subtract(MAX_BILL_AGE_MONTHS, 'month')
          .startOf('day'),
      }),
      createPastDueBill({
        dueDate: moment()
          .subtract(MAX_BILL_AGE_DAYS - 1, 'day')
          .startOf('day'),
      }),
    ]);

    const collectStub = sandbox.stub(Collection, 'collectSubscription').resolves();

    await runPublisher();

    sinon.assert.calledOnce(subscriptionCollectionStub);
    const expectedArgs = {
      subscriptionBillingId: billing.id,
      bankAccountId: bankAccount.id,
      recurringTransactionId: recurringTransaction.id,
    };
    expect(subscriptionCollectionStub.firstCall.args[0]).to.deep.eq(expectedArgs);

    await subscriptionCollectionPredictedPayday(expectedArgs);
    sinon.assert.calledOnce(collectStub);
  });

  it(`only collects bill with a due date ${MAX_BILL_AGE_DAYS} days or newer`, async () => {
    fakeDate(sandbox, '2019-10-17');

    const [{ billing, bankAccount, recurringTransaction }] = await Promise.all([
      createPastDueBill({
        dueDate: moment().subtract(MAX_BILL_AGE_DAYS - 1, 'days'),
      }),
      createPastDueBill({
        dueDate: moment().subtract(MAX_BILL_AGE_DAYS + 1, 'days'),
      }),
    ]);

    const collectStub = sandbox.stub(Collection, 'collectSubscription').resolves();

    await runPublisher();

    const expectedArgs = {
      subscriptionBillingId: billing.id,
      bankAccountId: bankAccount.id,
      recurringTransactionId: recurringTransaction.id,
    };

    sinon.assert.calledOnce(subscriptionCollectionStub);
    expect(subscriptionCollectionStub.firstCall.args[0]).to.deep.eq(expectedArgs);

    await subscriptionCollectionPredictedPayday(expectedArgs);
    expect(collectStub).to.have.callCount(1);
  });

  it('does not enqueue more than one past due bill for a user', async () => {
    fakeDate(sandbox, '2019-11-17');

    const { billing: billingForUser1 } = await createPastDueBill({
      dueDate: moment('2019-11-15', 'YYYY-MM-DD'),
    });
    const { billing: billingForUser2 } = await createPastDueBill({
      dueDate: moment('2019-11-10', 'YYYY-MM-DD'),
    });

    const bill2DueDate = moment('2019-10-15', 'YYYY-MM-DD');
    await factory.create('subscription-billing', {
      billingCycle: bill2DueDate.format('YYYY-MM'),
      dueDate: bill2DueDate,
      amount: 1,
      userId: billingForUser1.userId,
      start: bill2DueDate.clone().startOf('month'),
      end: bill2DueDate.clone().endOf('month'),
    });

    await runPublisher();

    sinon.assert.calledTwice(subscriptionCollectionStub);

    expect(subscriptionCollectionStub.firstCall.args[0]).to.include({
      subscriptionBillingId: billingForUser1.id,
    });

    expect(subscriptionCollectionStub.secondCall.args[0]).to.include({
      subscriptionBillingId: billingForUser2.id,
    });
  });

  it('Does not enqueue paid subscriptions', async () => {
    fakeDate(sandbox, '2019-11-17');
    const [
      { billing: bill1 },
      { billing: bill2 },
      { billing: bill3 },
      { billing: bill4 },
      payment1,
      payment2,
      payment3,
      payment4,
    ] = await Promise.all([
      createPastDueBill({ dueDate: moment('2019-11-15', 'YYYY-MM-DD') }),
      createPastDueBill({ dueDate: moment('2019-11-15', 'YYYY-MM-DD') }),
      createPastDueBill({ dueDate: moment('2019-11-15', 'YYYY-MM-DD') }),
      createPastDueBill({ dueDate: moment('2019-11-15', 'YYYY-MM-DD') }),
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Completed,
      }),
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Pending,
      }),
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Unknown,
      }),
      factory.create('subscription-payment', {
        status: ExternalTransactionStatus.Chargeback,
      }),
    ]);

    await Promise.all([
      bill1.addSubscriptionPayment(payment1),
      bill2.addSubscriptionPayment(payment2),
      bill3.addSubscriptionPayment(payment3),
      bill4.addSubscriptionPayment(payment4),
    ]);

    await runPublisher();

    sinon.assert.notCalled(subscriptionCollectionStub);
  });
});
