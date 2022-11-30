import { expect } from 'chai';
import factory from '../factories';
import { AuditLog, BankAccount, User } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import {
  fetchExternalTransactions,
  runAdvanceCollection,
  setupBankAccount,
  setupUser,
} from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('collect advance via synapse', async () => {
  let bankAccount: BankAccount;
  let user: User;

  before(async () => {
    ({ bankAccount, user } = await setupBankAccount());
    user = await setupUser(user, false);
  });

  it('should collect advance from bank account', async () => {
    // create advance to collect
    const advance = await factory.create('advance', {
      bankAccountId: bankAccount.id,
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
    const advanceCollectionAttempt = await runAdvanceCollection(advance, 10);
    const payment = await advanceCollectionAttempt.getPayment();

    // verify successful collection payment
    expect(payment.id).to.not.be.null;
    expect(payment.advanceId).to.equal(advance.id);
    expect(payment.bankAccountId).to.equal(bankAccount.id);
    expect(payment.bankTransactionId).to.be.null;
    expect(payment.paymentMethodId).to.be.null;
    expect(payment.userId).to.equal(user.id);
    expect(payment.amount).to.equal(0.03);
    expect(payment.externalProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
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
    expect(auditLogs[0].message).to.equal('Completed external payment');
    expect(auditLogs[0].extra.payment.type).to.equal('ach');
    expect(auditLogs[0].extra.payment.amount).to.equal(payment.amount);
    expect(auditLogs[0].extra.payment.status).to.equal(payment.status);
    expect(auditLogs[0].extra.payment.processor).to.equal(payment.externalProcessor);
    expect(auditLogs[0].extra.transactionType).to.equal('advance-payment');

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
