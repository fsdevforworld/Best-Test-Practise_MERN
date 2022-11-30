import { expect } from 'chai';
import factory from '../factories';
import { AuditLog, BankAccount, PaymentMethod, User } from '../../src/models';
import {
  createTabapayCard,
  fetchExternalTransactions,
  runAdvanceCollection,
  setupBankAccount,
  setupUser,
} from './helpers';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('collect advance via tabapay', async () => {
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

  it('should collect advance from debit card', async () => {
    // create an advance to collect
    const advance = await factory.create('advance', {
      bankAccountId: bankAccount.id,
      paymentMethodId: paymentMethod.id,
      userId: user.id,
      paybackDate: moment().format('YYYY-MM-DD'),
      amount: 75,
      outstanding: 0.03,
    });
    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 0,
      percent: 0,
    });

    // run collection attempt
    const advanceCollectionAttempt = await runAdvanceCollection(advance);
    const payment = await advanceCollectionAttempt.getPayment();

    // verify successful collection payment
    expect(payment.id).to.not.be.null;
    expect(payment.advanceId).to.equal(advance.id);
    expect(payment.bankAccountId).to.be.null;
    expect(payment.bankTransactionId).to.be.null;
    expect(payment.paymentMethodId).to.equal(paymentMethod.id);
    expect(payment.userId).to.equal(user.id);
    expect(payment.amount).to.equal(0.03);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(payment.externalId).to.not.be.null;
    expect(payment.status).to.equal('COMPLETED');
    expect(payment.referenceId).to.not.be.null;

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
    expect(auditLogs[0].extra.payment.type).to.equal('debit-card');
    expect(auditLogs[0].extra.payment.amount).to.equal(payment.amount);
    expect(auditLogs[0].extra.payment.status).to.equal(payment.status);
    expect(auditLogs[0].extra.payment.processor).to.equal(payment.externalProcessor);

    // fetch external transactions
    const externalTransactions = await fetchExternalTransactions(
      payment.externalId,
      'advance-payment',
    );

    expect(externalTransactions.status).to.equal('ok');
    expect(externalTransactions.results.length).to.equal(1);
    expect(externalTransactions.results[0].type).to.equal('advance-payment');
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
