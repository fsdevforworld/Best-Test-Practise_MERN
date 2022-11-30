import { expect } from 'chai';
import factory from '../factories';
import { AuditLog, BankAccount, SubscriptionPayment, User } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  fetchExternalTransactions,
  runSubscriptionCollection,
  setupBankAccount,
  setupUser,
} from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('subscription collection via synapse (next day ach)', async () => {
  let user: User;
  let bankAccount: BankAccount;

  before(async () => {
    ({ bankAccount, user } = await setupBankAccount());
    user = await setupUser(user, false);
  });

  it('should collect subscription from bank account', async () => {
    // create a subscription billing
    const subscriptionBilling = await factory.create('subscription-billing', {
      userId: user.id,
      dueDate: moment()
        .subtract(1, 'day')
        .format(),
    });

    // fake time to be in the ach window (9AM-4PM PST) for next day
    // hour 20 is in UTC - which is 12PM PST
    const fakeTime = moment().hour(20);

    // run collection attempt
    const subscriptionCollectionAttempt = await runSubscriptionCollection(
      subscriptionBilling,
      fakeTime,
    );
    const payment = await subscriptionCollectionAttempt.getSubscriptionPayment();

    // verify collection payment
    expect(payment.id).to.not.be.null;
    expect(payment.userId).to.equal(user.id);
    expect(payment.bankAccountId).to.equal(bankAccount.id);
    expect(payment.paymentMethodId).to.be.null;
    expect(payment.amount).to.equal(1);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    expect(payment.externalId).to.be.a('string').that.is.not.empty;
    expect(payment.status).to.equal('PENDING');
    expect(payment.referenceId).to.be.a('string').that.is.not.empty;

    // verify subscription payment created in db
    const subscriptionPayment = await SubscriptionPayment.findAll({
      where: {
        userId: user.id,
      },
    });

    expect(subscriptionPayment[0].userId).to.equal(user.id);
    expect(subscriptionPayment[0].bankAccountId).to.equal(bankAccount.id);
    expect(subscriptionPayment[0].amount).to.equal(1);
    expect(subscriptionPayment[0].externalProcessor).to.equal(
      ExternalTransactionProcessor.Synapsepay,
    );
    expect(subscriptionPayment[0].externalId).to.not.be.null;
    expect(subscriptionPayment[0].status).to.equal('PENDING');
    expect(subscriptionPayment[0].referenceId).to.not.be.null;

    // verify audit logs have a record of collection attempt
    const auditLogs = await AuditLog.findAll({
      where: {
        userId: user.id,
        type: 'EXTERNAL_PAYMENT',
      },
    });

    expect(auditLogs[0].userId).to.equal(user.id);
    expect(auditLogs[0].type).to.equal('EXTERNAL_PAYMENT');
    expect(auditLogs[0].successful).to.equal(true);
    expect(auditLogs[0].message).to.equal('Completed external payment');
    expect(auditLogs[0].extra.payment.type).to.equal('ach');
    expect(auditLogs[0].extra.payment.amount).to.equal(subscriptionPayment[0].amount);
    expect(auditLogs[0].extra.payment.status).to.equal(subscriptionPayment[0].status);
    expect(auditLogs[0].extra.payment.processor).to.equal(subscriptionPayment[0].externalProcessor);
    expect(auditLogs[0].extra.transactionType).to.equal('subscription-payment');

    // fetch external transactions
    const externalTransactions = await fetchExternalTransactions(
      subscriptionPayment[0].externalId,
      'subscription-payment',
    );

    expect(externalTransactions.status).to.equal('ok');
    expect(externalTransactions.results.length).to.equal(1);
    expect(externalTransactions.results[0].externalId).to.equal(payment.externalId);
    expect(externalTransactions.results[0].referenceId).to.equal(payment.referenceId);
    expect(externalTransactions.results[0].amount).to.equal(payment.amount);
    expect(externalTransactions.results[0].gateway).to.equal(
      ExternalTransactionProcessor.Synapsepay,
    );
    expect(externalTransactions.results[0].outcome.message).to.equal('Transaction Created.');
    expect(externalTransactions.results[0].processor).to.equal(payment.externalProcessor);
    expect(externalTransactions.results[0].reversalStatus).to.be.null;
    expect(externalTransactions.results[0].status).to.equal('PENDING');
    expect(externalTransactions.results[0].isSettlement).to.equal(false);
  }).timeout(300000);
});
