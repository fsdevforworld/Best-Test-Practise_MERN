import { expect } from 'chai';
import factory from '../factories';
import { AuditLog, BankAccount, PaymentMethod, User } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  createTabapayCard,
  fetchExternalTransactions,
  runAdvanceCollection,
  setupBankAccount,
  setupUser,
} from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('collect advance via synapse as a fallback', async () => {
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

  it('should collect advance from bank account as a fallback when tabapay fails', async () => {
    // use an outstanding amount of 0.01 to trigger an error in tabapay's sandbox
    const advance = await factory.create('advance', {
      paymentMethodId: paymentMethod.id,
      bankAccountId: bankAccount.id,
      userId: user.id,
      paybackDate: moment().format('YYYY-MM-DD'),
      amount: 75,
      outstanding: 0.01,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });

    // run collection attempt
    const advanceCollectionAttempt = await runAdvanceCollection(advance, 10);
    const payment = await advanceCollectionAttempt.getPayment();

    // verify successful collection payment
    expect(payment.id).to.not.be.null;
    expect(payment.advanceId).to.equal(advance.id);
    expect(payment.bankAccountId).to.equal(bankAccount.id);
    expect(payment.bankTransactionId).to.be.null;
    expect(payment.paymentMethodId).to.be.null;
    expect(payment.userId).to.equal(user.id);
    expect(payment.amount).to.equal(0.01);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    expect(payment.externalId).to.not.be.null;
    expect(payment.status).to.equal('PENDING');
    expect(payment.referenceId).to.not.be.null;

    // verify audit logs have a record of both failed and successful collection attempts
    const auditLogs = await AuditLog.findAll({
      where: {
        userId: user.id,
        type: 'EXTERNAL_PAYMENT',
      },
    });

    expect(auditLogs[0].userId).to.equal(user.id);
    expect(auditLogs[0].type).to.equal('EXTERNAL_PAYMENT');
    expect(auditLogs[0].successful).to.equal(false);
    expect(auditLogs[0].message).to.equal('Failed to create external payment');
    expect(auditLogs[0].extra.processor).to.equal(ExternalTransactionProcessor.Tabapay);

    expect(auditLogs[1].userId).to.equal(user.id);
    expect(auditLogs[1].type).to.equal('EXTERNAL_PAYMENT');
    expect(auditLogs[1].successful).to.equal(true);
    expect(auditLogs[1].message).to.equal('Completed external payment');
    expect(auditLogs[1].extra.payment.type).to.equal('ach');
    expect(auditLogs[1].extra.payment.amount).to.equal(payment.amount);
    expect(auditLogs[1].extra.payment.status).to.equal(payment.status);
    expect(auditLogs[1].extra.payment.processor).to.equal(payment.externalProcessor);
    expect(auditLogs[1].extra.transactionType).to.equal('advance-payment');

    // fetch external transactions
    const externalTransactions = await fetchExternalTransactions(
      payment.externalId,
      'advance-payment',
    );

    expect(externalTransactions.status).to.equal('ok');
    expect(externalTransactions.results.length).to.equal(1);
    expect(externalTransactions.results[0].externalId).to.equal(payment.externalId);
    expect(externalTransactions.results[0].referenceId).to.equal(payment.referenceId);
    expect(externalTransactions.results[0].amount).to.equal(payment.amount);
    expect(externalTransactions.results[0].outcome.message).to.equal('Transaction Created.');
    expect(externalTransactions.results[0].processor).to.equal(payment.externalProcessor);
  }).timeout(300000);
});
