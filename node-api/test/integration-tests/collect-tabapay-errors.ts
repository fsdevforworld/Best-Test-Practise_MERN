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

describe('collect advance via tabapay errors', async () => {
  let bankAccount: BankAccount;
  let user: User;
  let paymentMethod: PaymentMethod;

  beforeEach(async () => {
    ({ bankAccount, user, paymentMethod } = await setupBankAccount());
    user = await setupUser(user, false);
    const tabapayCard = await createTabapayCard(user, bankAccount);

    // set payment method
    const { paymentMethodId } = tabapayCard;
    paymentMethod = await PaymentMethod.findByPk(paymentMethodId);
  });

  it('should fail to collect advance with transaction error', async () => {
    // trigger transaction error in tabapay sandbox with an outstanding of 0.01
    const advance = await factory.create('advance', {
      bankAccountId: bankAccount.id,
      paymentMethodId: paymentMethod.id,
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

    // run collection task
    await runAdvanceCollection(advance, 10);

    // verify audit logs have a record of collection attempt
    const auditLogs = await AuditLog.findAll({
      where: {
        userId: user.id,
        type: 'EXTERNAL_PAYMENT',
      },
    });

    expect(auditLogs[0].userId).to.equal(user.id);
    expect(auditLogs[0].type).to.equal('EXTERNAL_PAYMENT');
    expect(auditLogs[0].successful).to.equal(false);
    expect(auditLogs[0].eventUuid).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].message).to.equal('Failed to create external payment');
    expect(auditLogs[0].extra.err.data.EC).to.equal('0');
    expect(auditLogs[0].extra.err.data.SC).to.equal(200);
    expect(auditLogs[0].extra.err.data.status).to.equal('ERROR');
    expect(auditLogs[0].extra.err.data.gateway).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(auditLogs[0].extra.err.data.network).to.equal('Visa');
    expect(auditLogs[0].extra.err.data.networkRC).to.equal('ZZ');
    expect(auditLogs[0].extra.err.data.approvalCode).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.err.data.transactionID).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.err.data.isSubscription).to.equal(false);
    expect(auditLogs[0].extra.err.data.processorHttpStatus).to.equal(200);
    expect(auditLogs[0].extra.err.name).to.equal('PaymentProcessorError');
    expect(auditLogs[0].extra.err.stack).to.contain(
      'PaymentProcessorError: Card entry declined. Please check that your debit card information is correct and try again.',
    );
    expect(auditLogs[0].extra.err.gateway).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(auditLogs[0].extra.err.message).to.equal(
      'Card entry declined. Please check that your debit card information is correct and try again.',
    );
    expect(auditLogs[0].extra.err.showUuid).to.equal(true);
    expect(auditLogs[0].extra.err.processor).to.be.null;
    expect(auditLogs[0].extra.err.customCode).to.equal(500);
    expect(auditLogs[0].extra.err.statusCode).to.equal(424);
    expect(auditLogs[0].extra.err.processorResponse).to.equal('ZZ');
    expect(auditLogs[0].extra.err.processorHttpStatus).to.equal(200);
    expect(auditLogs[0].extra.type).to.equal('debit-card');
    expect(auditLogs[0].extra.processor).to.equal(ExternalTransactionProcessor.Tabapay);
  }).timeout(300000);

  it('should collect advance with transaction processing failed', async () => {
    // trigger transaction processing failed error in tabapay sandbox with 0.02
    const advance = await factory.create('advance', {
      bankAccountId: bankAccount.id,
      paymentMethodId: paymentMethod.id,
      userId: user.id,
      paybackDate: moment().format('YYYY-MM-DD'),
      amount: 75,
      outstanding: 0.02,
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
    expect(payment.bankAccountId).to.be.null;
    expect(payment.bankTransactionId).to.be.null;
    expect(payment.paymentMethodId).to.equal(paymentMethod.id);
    expect(payment.userId).to.equal(user.id);
    expect(payment.amount).to.equal(0.02);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(payment.externalId).to.not.be.null;
    expect(payment.status).to.equal('PENDING');
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
    expect(auditLogs[0].eventUuid).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].message).to.equal('Completed external payment');
    expect(auditLogs[0].extra.payment.id).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.payment.type).to.equal('debit-card');
    expect(auditLogs[0].extra.payment.amount).to.equal(0.02);
    expect(auditLogs[0].extra.payment.status).to.equal('PENDING');
    expect(auditLogs[0].extra.payment.processor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(auditLogs[0].extra.payment.chargeable.id).to.be.a('number');
    expect(auditLogs[0].extra.payment.chargeable.bin).to.equal('940011');
    expect(auditLogs[0].extra.payment.chargeable.mask).to.equal('9990');
    expect(auditLogs[0].extra.payment.chargeable.linked).to.equal(false);
    expect(auditLogs[0].extra.payment.chargeable.scheme).to.equal('other');
    expect(auditLogs[0].extra.payment.chargeable.userId).to.equal(user.id);
    expect(auditLogs[0].extra.payment.chargeable.created).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.payment.chargeable.deleted).to.be.null;
    expect(auditLogs[0].extra.payment.chargeable.invalid).to.be.null;
    expect(auditLogs[0].extra.payment.chargeable.updated).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.payment.chargeable.zipCode).to.equal('90019');
    expect(auditLogs[0].extra.payment.chargeable.risepayId).to.be.null;
    expect(auditLogs[0].extra.payment.chargeable.tabapayId).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.payment.chargeable.expiration).to.be.a('string').that.is.not.empty;
    expect(auditLogs[0].extra.payment.chargeable.displayName).to.equal('Other: 9990');
    expect(auditLogs[0].extra.payment.chargeable.empyrCardId).to.be.null;
    expect(auditLogs[0].extra.payment.chargeable.availability).to.equal('immediate');
    expect(auditLogs[0].extra.payment.chargeable.bankAccountId).to.equal(bankAccount.id);
    expect(auditLogs[0].extra.payment.chargeable.invalidReasonCode).to.be.null;
    expect(auditLogs[0].extra.payment.chargeable.optedIntoDaveRewards).to.equal(false);

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
    expect(externalTransactions.results[0].outcome).to.be.a('object');
    expect(externalTransactions.results[0].processor).to.equal(payment.externalProcessor);
    expect(externalTransactions.results[0].raw.SC).to.equal(200);
    expect(externalTransactions.results[0].raw.EC).to.equal('0');
    expect(externalTransactions.results[0].raw.referenceID).to.not.be.null;
    expect(externalTransactions.results[0].raw.network).to.equal('Visa');
    expect(externalTransactions.results[0].raw.status).to.equal('UNKNOWN');
    expect(externalTransactions.results[0].raw.errors[0]).to.equal('000E7740');
    expect(externalTransactions.results[0].raw.errors[1]).to.equal('21100000');
    expect(externalTransactions.results[0].raw.errors[2]).to.equal('211');
    expect(externalTransactions.results[0].raw.amount).to.equal(payment.amount.toString());
    expect(externalTransactions.results[0].raw.last4).to.equal('9990');
  }).timeout(300000);
});
