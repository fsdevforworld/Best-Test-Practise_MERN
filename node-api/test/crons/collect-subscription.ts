import {
  BankingDataSource,
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  MicroDeposit,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import { Moment } from 'moment';
import * as sinon from 'sinon';
import CollectSubscription, {
  MIN_BALANCE_NEXT_DAY_ACH_FRIDAY,
  MIN_BALANCE_NEXT_DAY_ACH_MON_THUR,
} from '../../src/consumers/subscription-payment-processor/task';
import SynapsepayNodeLib from '../../src/domain/synapsepay/node';
import * as BankAccountHelper from '../../src/domain/banking-data-sync';
import {
  MAX_BILL_AGE_DAYS,
  MAX_BILL_AGE_MONTHS,
} from '../../src/domain/collection/collect-subscription';
import { SUBSCRIPTION_COLLECTION_TRIGGER } from '../../src/domain/collection';
import { BankDataSourceRefreshError, CUSTOM_ERROR_CODES, PaymentError } from '../../src/lib/error';
import gcloudKms from '../../src/lib/gcloud-kms';
import { moment } from '@dave-inc/time-lib';
import * as Tabapay from '../../src/lib/tabapay';
import { AuditLog } from '../../src/models';
import { ChargeableMethod, ExecutionStatus } from '../../src/typings';
import factory from '../factories';
import { clean, fakeDateTime, stubLoomisClient } from '../test-helpers';
import { paymentUpdateEvent } from '../../src/domain/event';

describe('CollectSubscription', () => {
  let paymentUpdateEventStub: sinon.SinonStub;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => {
    stubLoomisClient(sandbox);
    paymentUpdateEventStub = sandbox.stub(paymentUpdateEvent, 'publish').resolves();
  });

  afterEach(() => clean(sandbox));

  it('collects from the payment method on the default bank account', async () => {
    const { card, subscriptionBilling } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
    });

    await new CollectSubscription(
      subscriptionBilling.id,
      SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
    ).run();

    const [payment] = await subscriptionBilling.getSubscriptionPayments();

    expect(payment.amount).to.equal(1);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(payment.paymentMethodId).to.equal(card.id);
    expect(payment.bankAccountId).to.equal(null);
  });

  it(`collects using next day ACH if the account balance is greater than $${MIN_BALANCE_NEXT_DAY_ACH_FRIDAY} on Friday`, async () => {
    // Friday
    fakeDateTime(sandbox, moment('2019-11-08 12', 'YYYY-MM-DD HH'));

    const {
      user,
      achChargeStub,
      subscriptionBilling,
      debitChargeStub,
    } = await setupCollectionScenario({
      balance: MIN_BALANCE_NEXT_DAY_ACH_FRIDAY + 0.01,
      successfulChargeType: ChargeableMethod.Ach,
      createBankWithDebit: false,
    });

    await new CollectSubscription(subscriptionBilling.id, null).run();

    const [payment] = await subscriptionBilling.getSubscriptionPayments();

    expect(payment.amount).to.equal(1);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    expect(payment.paymentMethodId).to.equal(null);
    expect(payment.bankAccountId).to.equal(user.defaultBankAccountId);

    sinon.assert.notCalled(debitChargeStub);
    sinon.assert.calledWith(
      achChargeStub,
      sinon.match.any,
      sinon.match.any,
      subscriptionBilling.amount,
      sinon.match.string,
      sinon.match({ isSameDay: false }),
    );
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it(`collects using next day ACH if the account balance is greater than $${MIN_BALANCE_NEXT_DAY_ACH_MON_THUR} on Mon-Thur`, async () => {
    // Thursday
    fakeDateTime(sandbox, moment('2019-11-07 12', 'YYYY-MM-DD HH'));

    const {
      user,
      achChargeStub,
      subscriptionBilling,
      debitChargeStub,
    } = await setupCollectionScenario({
      balance: MIN_BALANCE_NEXT_DAY_ACH_MON_THUR + 0.01,
      successfulChargeType: ChargeableMethod.Ach,
      createBankWithDebit: false,
    });

    await new CollectSubscription(subscriptionBilling.id, null).run();

    const [payment] = await subscriptionBilling.getSubscriptionPayments();

    expect(payment.amount).to.equal(1);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    expect(payment.paymentMethodId).to.equal(null);
    expect(payment.bankAccountId).to.equal(user.defaultBankAccountId);

    sinon.assert.notCalled(debitChargeStub);
    sinon.assert.calledWith(
      achChargeStub,
      sinon.match.any,
      sinon.match.any,
      subscriptionBilling.amount,
      sinon.match.string,
      sinon.match({ isSameDay: false }),
    );
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it('collects using ACH if the debit card fails and account balance is greater than 10', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 12', 'YYYY-MM-DD HH'));

    const { user, subscriptionBilling, debitChargeStub } = await setupCollectionScenario({
      balance: 10.01,
      successfulChargeType: ChargeableMethod.Ach,
    });

    await new CollectSubscription(subscriptionBilling.id, null).run();

    const expectedAmount = 1;

    const [payment] = await subscriptionBilling.getSubscriptionPayments();

    const isSubscription = true;
    sinon.assert.calledWith(
      debitChargeStub,
      sinon.match.string,
      sinon.match.string,
      expectedAmount,
      isSubscription,
    );

    expect(payment.amount).to.equal(expectedAmount);
    expect(payment.externalProcessor).to.equal('SYNAPSEPAY');
    expect(payment.paymentMethodId).to.equal(null);
    expect(payment.bankAccountId).to.equal(user.defaultBankAccountId);
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it('should retry when hitting plaid balance rate limit', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 12', 'YYYY-MM-DD HH'));

    const { balanceCheckStub, subscriptionBilling } = await setupCollectionScenario({
      balance: 10.01,
      successfulChargeType: ChargeableMethod.Ach,
    });

    balanceCheckStub.throws(
      new BankDataSourceRefreshError('rate limit sux', {
        customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
        source: BankingDataSource.Plaid,
        statusCode: 400,
      }),
    );

    const result = await new CollectSubscription(subscriptionBilling.id, null).run();

    expect(result).to.deep.equal({
      status: ExecutionStatus.FailureDoNotRetry,
      failures: [{ message: 'plaid_rate_limit' }],
    });
  });

  it('should not retry when hitting mx balance rate limit', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 12', 'YYYY-MM-DD HH'));

    const { balanceCheckStub, subscriptionBilling } = await setupCollectionScenario({
      balance: 10.01,
      successfulChargeType: ChargeableMethod.Ach,
    });

    balanceCheckStub.throws(
      new BankDataSourceRefreshError('rate limit sux', {
        customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
        source: BankingDataSource.Mx,
        statusCode: 400,
      }),
    );

    const result = await new CollectSubscription(subscriptionBilling.id, null).run();

    expect(result).to.be.undefined;
  });

  it('collects from the bank account if no payment method is available', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 14', 'YYYY-MM-DD HH'));

    const { card, subscriptionBilling, bankAccount } = await setupCollectionScenario({
      balance: 10.01,
      successfulChargeType: ChargeableMethod.Ach,
    });
    await card.destroy();
    await new CollectSubscription(subscriptionBilling.id, null).run();

    const [payment] = await subscriptionBilling.getSubscriptionPayments();

    expect(payment.amount).to.equal(1);
    expect(payment.externalProcessor).to.equal('SYNAPSEPAY');
    expect(payment.paymentMethodId).to.equal(null);
    expect(payment.bankAccountId).to.equal(bankAccount.id);
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it('does not charge the debit card or the bank account if micro deposit has not succeeded', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 14', 'YYYY-MM-DD HH'));

    const {
      subscriptionBilling,
      card,
      bankAccount,
      debitChargeStub,
      achChargeStub,
    } = await setupCollectionScenario({
      balance: 100,
      successfulChargeType: ChargeableMethod.DebitCard,
    });
    await bankAccount.update({ microDeposit: MicroDeposit.REQUIRED });
    await card.destroy();
    await new CollectSubscription(subscriptionBilling.id, null).run();

    sinon.assert.notCalled(achChargeStub);
    sinon.assert.notCalled(debitChargeStub);
  });

  it('does not attempt an ACH transaction if it is outstide the Same-Day ACH window', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 20', 'YYYY-MM-DD HH'));

    const { subscriptionBilling, achChargeStub } = await setupCollectionScenario({
      balance: 30,
      successfulChargeType: ChargeableMethod.DebitCard,
    });

    await new CollectSubscription(subscriptionBilling.id, null).run();

    sinon.assert.notCalled(achChargeStub);
    sinon.assert.calledOnce(paymentUpdateEventStub);
  });

  it('attempts debit but not ACH if they have a balance between $5 and $10', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 12', 'YYYY-MM-DD HH'));

    const createStub = sandbox.stub(AuditLog, 'create').resolves();
    const { subscriptionBilling, debitChargeStub, achChargeStub } = await setupCollectionScenario({
      balance: 9.99,
      successfulChargeType: ChargeableMethod.Ach,
    });
    const task = new CollectSubscription(subscriptionBilling.id, null);
    await task.run();

    const expectedAmount = 1;

    const isSubscription = true;
    sinon.assert.calledWith(
      debitChargeStub,
      sinon.match.string,
      sinon.match.string,
      expectedAmount,
      isSubscription,
    );
    sinon.assert.calledOnce(debitChargeStub);
    sinon.assert.notCalled(achChargeStub);

    const log = createStub.secondCall.args[0];
    expect(log.message).to.equal('Collection attempt was unsuccessful');
    expect(log.successful).to.equal(false);
  });

  it('does not attempt collection if balance is less than $5', async () => {
    const createStub = sandbox.stub(AuditLog, 'create').resolves();
    const { subscriptionBilling, debitChargeStub, achChargeStub } = await setupCollectionScenario({
      balance: 4.99,
      successfulChargeType: ChargeableMethod.DebitCard,
    });
    const task = new CollectSubscription(
      subscriptionBilling.id,
      SUBSCRIPTION_COLLECTION_TRIGGER.BANK_ACCOUNT_UPDATE,
    );
    await task.run();

    sinon.assert.notCalled(debitChargeStub);
    sinon.assert.notCalled(achChargeStub);

    const log = createStub.firstCall.args[0];
    expect(log.message).to.equal('Balance too low to attempt collection');
    expect(log.successful).to.equal(false);
    expect(log.extra.err.data.balance).to.equal(4.99);
  });

  it('does not run a balance check if skipBalanceCheck is true', async () => {
    const { subscriptionBilling, balanceCheckStub } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
    });
    const task = new CollectSubscription(
      subscriptionBilling.id,
      SUBSCRIPTION_COLLECTION_TRIGGER.PAST_DUE_RECENT_ACCOUNT_UPDATE_JOB,
    );
    task.skipBalanceCheck = true;

    await task.run();

    sinon.assert.notCalled(balanceCheckStub);
  });

  it('does not run a balance check if chargeables is empty', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 20', 'YYYY-MM-DD HH'));
    const { subscriptionBilling, card, user, balanceCheckStub } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
    });
    await user.update({ firstName: null, lastName: null });
    await card.destroy();

    const task = new CollectSubscription(subscriptionBilling.id, null);

    await task.run();

    sinon.assert.notCalled(balanceCheckStub);
  });

  it(`does not attempt collection for bill with an age over ${MAX_BILL_AGE_DAYS} days`, async () => {
    fakeDateTime(sandbox, moment('2019-10-10 20', 'YYYY-MM-DD HH'));
    const createStub = sandbox.stub(AuditLog, 'create').resolves();

    const { subscriptionBilling, debitChargeStub } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
      dueDate: moment().subtract(MAX_BILL_AGE_DAYS + 1, 'days'),
    });

    const task = new CollectSubscription(subscriptionBilling.id, null);

    await task.run();

    sinon.assert.notCalled(debitChargeStub);

    const log = createStub.firstCall.args[0];
    expect(log.message).to.equal('Bill is too old to collect');
    expect(log.successful).to.equal(false);
  });

  it(`does not attempt collection for bill with an age over ${MAX_BILL_AGE_MONTHS} months (visually for user)`, async () => {
    fakeDateTime(sandbox, moment('2019-10-01 20', 'YYYY-MM-DD HH'));
    const createStub = sandbox.stub(AuditLog, 'create').resolves();

    const { subscriptionBilling, debitChargeStub } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
      dueDate: moment().subtract(MAX_BILL_AGE_MONTHS + 1, 'month'),
    });

    const task = new CollectSubscription(subscriptionBilling.id, null);

    await task.run();

    sinon.assert.notCalled(debitChargeStub);

    const log = createStub.firstCall.args[0];
    expect(log.message).to.equal('Bill is too old to collect');
    expect(log.successful).to.equal(false);
  });

  it('does not attempt collection if the card is expired', async () => {
    fakeDateTime(sandbox, moment('2019-10-10 20', 'YYYY-MM-DD HH'));
    const { card, subscriptionBilling, debitChargeStub } = await setupCollectionScenario({
      balance: 5.01,
      successfulChargeType: ChargeableMethod.DebitCard,
      dueDate: moment().subtract(1, 'month'),
    });

    card.update({ expiration: moment().subtract(1, 'month') });

    const task = new CollectSubscription(subscriptionBilling.id, null);

    await task.run();
    await card.reload({ paranoid: false });

    sinon.assert.notCalled(debitChargeStub);
    expect(card.invalid).to.not.be.null;
    expect(card.invalidReasonCode).to.eq('54');
  });

  async function setupCollectionScenario({
    balance,
    successfulChargeType,
    cardExpiration = undefined,
    dueDate = moment(),
    createBankWithDebit = true,
  }: {
    balance: number;
    successfulChargeType: ChargeableMethod;
    cardExpiration?: Moment;
    dueDate?: Moment;
    createBankWithDebit?: boolean;
  }) {
    const bankAccount = await factory.create('checking-account');
    const user = await bankAccount.getUser();

    let card;
    if (createBankWithDebit) {
      card = await factory.create('payment-method', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        expiration: cardExpiration || moment().add(1, 'month'),
      });

      await bankAccount.update({ defaultPaymentMethodId: card.id });
    }
    const [billing] = await Bluebird.all([
      factory.create('subscription-billing', { userId: user.id, dueDate }),
      user.update({
        defaultBankAccountId: bankAccount.id,
        firstName: 'Kanye',
        lastName: 'West',
      }),
    ]);

    let debitChargeStub: sinon.SinonStub;
    let achChargeStub: sinon.SinonStub;

    if (successfulChargeType === ChargeableMethod.Ach) {
      achChargeStub = sandbox.stub(SynapsepayNodeLib, 'charge').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 'foo-bar',
      });
      debitChargeStub = sandbox
        .stub(Tabapay, 'retrieve')
        .rejects(new PaymentError('Failed to process payment'));
    } else if (successfulChargeType === ChargeableMethod.DebitCard) {
      debitChargeStub = sandbox.stub(Tabapay, 'retrieve').resolves({
        status: ExternalTransactionStatus.Completed,
        id: 'foo-bar',
      });
      achChargeStub = sandbox.stub(SynapsepayNodeLib, 'charge').rejects(new PaymentError());
    }

    sandbox.stub(gcloudKms, 'decrypt').resolves('123|456');

    const balanceCheckStub = sandbox
      .stub(BankAccountHelper, 'refreshBalance')
      .resolves({ available: balance, current: balance });

    return {
      bankAccount,
      user,
      card,
      subscriptionBilling: billing,
      debitChargeStub,
      balanceCheckStub,
      achChargeStub,
    };
  }
});
