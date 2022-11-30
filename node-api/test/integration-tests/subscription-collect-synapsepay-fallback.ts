import { expect } from 'chai';
import factory from '../factories';
import { AuditLog, BankAccount, PaymentMethod, SubscriptionPayment, User } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  createTabapayCard,
  fetchExternalTransactions,
  runSubscriptionCollection,
  setupBankAccount,
  setupUser,
} from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('subscription collection via tabapay as a fallback', async () => {
  let bankAccount: BankAccount;
  let user: User;
  let paymentMethod: PaymentMethod;

  before(async () => {
    ({ bankAccount, user, paymentMethod } = await setupBankAccount());
    user = await setupUser(user, false);
  });

  it('should create a tabapay card', async () => {
    const tabapayCard = await createTabapayCard(user, bankAccount);

    // set payment method
    const { paymentMethodId } = tabapayCard;
    paymentMethod = await PaymentMethod.findByPk(paymentMethodId);
  }).timeout(300000);

  it('should collect subscription via tabapay as a fallback when synapse fails', async () => {
    // create a subscription billing
    const subscriptionBilling = await factory.create('subscription-billing', {
      userId: user.id,
      dueDate: moment()
        .subtract(1, 'day')
        .format(),
      amount: 0.03,
    });

    // fake time to be outside of ach window to initiate fallback
    const fakeTime = moment().hour(5);

    // run collection attempt
    const subscriptionCollectionAttempt = await runSubscriptionCollection(
      subscriptionBilling,
      fakeTime,
    );
    const payment = await subscriptionCollectionAttempt.getSubscriptionPayment();

    // verify collection payment
    expect(payment.id).to.not.be.null;
    expect(payment.userId).to.equal(user.id);
    expect(payment.bankAccountId).to.be.null;
    expect(payment.paymentMethodId).to.equal(paymentMethod.id);
    expect(payment.amount).to.equal(0.03);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(payment.externalId).to.be.a('string').that.is.not.empty;
    expect(payment.status).to.equal('COMPLETED');
    expect(payment.referenceId).to.be.a('string').that.is.not.empty;

    // verify subscription payment created in db
    const subscriptionPayment = await SubscriptionPayment.findAll({
      where: {
        userId: user.id,
      },
    });

    expect(subscriptionPayment[0].userId).to.equal(user.id);
    expect(subscriptionPayment[0].bankAccountId).to.be.null;
    expect(subscriptionPayment[0].paymentMethodId).to.equal(paymentMethod.id);
    expect(subscriptionPayment[0].amount).to.equal(payment.amount);
    expect(subscriptionPayment[0].externalProcessor).to.equal(payment.externalProcessor);
    expect(subscriptionPayment[0].externalId).to.equal(payment.externalId);
    expect(subscriptionPayment[0].status).to.equal(payment.status);
    expect(subscriptionPayment[0].referenceId).to.be.a('string').that.is.not.empty;

    // verify audit logs have a record of both failed and successful collection attempts
    const externalPaymentAuditLog = await AuditLog.findAll({
      where: {
        userId: user.id,
        type: 'EXTERNAL_PAYMENT',
      },
    });

    const subscriptionCollectionAuditLog = await AuditLog.findAll({
      where: {
        userId: user.id,
        type: 'PAST_DUE_SUBSCRIPTION_COLLECTION',
      },
    });

    expect(externalPaymentAuditLog[0].userId).to.equal(user.id);
    expect(externalPaymentAuditLog[0].type).to.equal('EXTERNAL_PAYMENT');
    expect(externalPaymentAuditLog[0].successful).to.equal(true);
    expect(externalPaymentAuditLog[0].message).to.equal('Completed external payment');
    expect(externalPaymentAuditLog[0].extra.payment.type).to.equal('debit-card');
    expect(externalPaymentAuditLog[0].extra.payment.amount).to.equal(payment.amount);
    expect(externalPaymentAuditLog[0].extra.payment.status).to.equal(payment.status);
    expect(externalPaymentAuditLog[0].extra.payment.processor).to.equal(payment.externalProcessor);

    expect(subscriptionCollectionAuditLog[0].userId).to.equal(user.id);
    expect(subscriptionCollectionAuditLog[0].type).to.equal('PAST_DUE_SUBSCRIPTION_COLLECTION');
    expect(subscriptionCollectionAuditLog[0].successful).to.equal(true);
    expect(subscriptionCollectionAuditLog[0].message).to.equal('Collection successful');
    expect(subscriptionCollectionAuditLog[0].extra.subscriptionPaymentId).to.equal(payment.id);

    // fetch external transactions
    const externalTransactions = await fetchExternalTransactions(
      payment.externalId,
      'subscription-payment',
    );

    expect(externalTransactions.status).to.equal('ok');
    expect(externalTransactions.results.length).to.equal(1);
    expect(externalTransactions.results[0].type).to.equal('subscription-payment');
    expect(externalTransactions.results[0].externalId).to.equal(payment.externalId);
    expect(externalTransactions.results[0].referenceId).to.equal(payment.referenceId);
    expect(externalTransactions.results[0].amount).to.equal(payment.amount);
    expect(externalTransactions.results[0].outcome.code).to.equal('00');
    expect(externalTransactions.results[0].processor).to.equal(payment.externalProcessor);
    expect(externalTransactions.results[0].raw.SC).to.equal(200);
    expect(externalTransactions.results[0].raw.EC).to.equal('0');
    expect(externalTransactions.results[0].raw.referenceID).to.equal(payment.referenceId);
    expect(externalTransactions.results[0].raw.network).to.equal('Visa');
    expect(externalTransactions.results[0].raw.networkRC).to.equal('00');
    expect(externalTransactions.results[0].raw.status).to.equal('COMPLETED');
    expect(externalTransactions.results[0].raw.approvalCode).to.not.be.null;
    expect(externalTransactions.results[0].raw.amount).to.equal(payment.amount.toString());
    expect(externalTransactions.results[0].raw.last4).to.equal('9990');
    expect(externalTransactions.results[0].reversalStatus).to.equal('FAILED');
    expect(externalTransactions.results[0].status).to.equal('COMPLETED');
    expect(externalTransactions.results[0].isSettlement).to.equal(false);
  }).timeout(300000);
});
