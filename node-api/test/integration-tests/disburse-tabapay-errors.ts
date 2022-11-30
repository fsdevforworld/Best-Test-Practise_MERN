import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../factories';
import {
  Advance,
  AdvanceApproval,
  BankAccount,
  PaymentMethod,
  RecurringTransaction,
  User,
} from '../../src/models';
import {
  createTabapayCard,
  fetchExternalTransactions,
  setSynapseNodeId,
  setupBankAccount,
  setupUser,
  STAGING_URL,
} from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import { getAvailableDatesForNoIncome } from '../../src/domain/advance-delivery';

describe('disburse advance via tabapay errors', async () => {
  let bankAccount: BankAccount;
  let user: User;
  let paymentMethod: PaymentMethod;
  let recurringTransaction: RecurringTransaction;
  let defaultPaybackDate: string;

  before(async () => {
    ({ bankAccount, user, paymentMethod } = await setupBankAccount());

    await factory.create('synapsepay-document', {
      userId: bankAccount.userId,
    });
    user = await setupUser(user, true);
    bankAccount = await setSynapseNodeId(bankAccount);

    const tabapayCard = await createTabapayCard(user, bankAccount);

    // set payment method
    const { paymentMethodId } = tabapayCard;
    paymentMethod = await PaymentMethod.findByPk(paymentMethodId);

    // create a recurring transaction to be used as main paycheck
    recurringTransaction = await factory.create('recurring-transaction', {
      bankAccountId: bankAccount.id,
      userId: user.id,
      userAmount: 400,
    });
    bankAccount.mainPaycheckRecurringTransactionId = recurringTransaction.id;
    await bankAccount.save();

    const availablePaybackDates = await getAvailableDatesForNoIncome();

    defaultPaybackDate = availablePaybackDates[0];

    // create advance approval with tabapay sandbox error amounts
    await AdvanceApproval.create({
      recurringTransactionId: recurringTransaction.id,
      userId: user.id,
      bankAccountId: bankAccount.id,
      approvedAmounts: [0.01, 0.02, 0.04],
      normalAdvanceApproved: false,
      microAdvanceApproved: true,
      approved: true,
      rejectionReasons: [],
      defaultPaybackDate,
    });
  });

  it('should encounter a transaction error when disbursing to card', async () => {
    // request advance with 0.01 to trigger transaction error in tabapay sandbox
    const advanceRequest = await request(STAGING_URL)
      .post('/v2/advance')
      .set('Authorization', user.id.toString())
      .set('X-Device-Id', user.id.toString())
      .set('X-App-Version', '2.12.0')
      .send({
        bank_account_id: bankAccount.id,
        recurringTransactionId: recurringTransaction.id,
        delivery: 'express',
        paybackDate: defaultPaybackDate,
        tip_percent: 0,
        amount: 0.01,
      })
      .expect(424);

    // verify response from advance request
    expect(advanceRequest.body.type).to.equal('payment_processor');
    expect(advanceRequest.body.message).to.contain(
      'Card entry declined. Please check that your debit card information is correct and try again.',
    );
    expect(advanceRequest.body.customCode).to.equal(500);
    expect(advanceRequest.body.data.SC).to.equal(200);
    expect(advanceRequest.body.data.EC).to.equal('0');
    expect(advanceRequest.body.data.transactionID).to.be.a('string').that.is.not.empty;
    expect(advanceRequest.body.data.network).to.equal('Visa');
    expect(advanceRequest.body.data.networkRC).to.equal('ZZ');
    expect(advanceRequest.body.data.status).to.equal('ERROR');
    expect(advanceRequest.body.data.processorHttpStatus).to.equal(200);
    expect(advanceRequest.body.data.gateway).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(advanceRequest.body.data.isSubscription).to.equal(false);
  }).timeout(300000);

  it('should encounter transaction processing failed when disbursing to card', async () => {
    // request advance with 0.02 to trigger transaction processing failed in tabapay sandbox
    const advanceRequest = await request(STAGING_URL)
      .post('/v2/advance')
      .set('Authorization', user.id.toString())
      .set('X-Device-Id', user.id.toString())
      .set('X-App-Version', '2.12.0')
      .send({
        bank_account_id: bankAccount.id,
        recurringTransactionId: recurringTransaction.id,
        delivery: 'express',
        paybackDate: defaultPaybackDate,
        tip_percent: 0,
        amount: 0.02,
      })
      .expect(200);

    // verify response from advance request
    expect(advanceRequest.body.id).to.be.a('number');
    expect(advanceRequest.body.amount).to.equal(0.02);
    expect(advanceRequest.body.tip).to.equal(0);
    expect(advanceRequest.body.tipPercent).to.equal(0);
    expect(advanceRequest.body.fee).to.equal(1.99);
    expect(advanceRequest.body.paybackDate).to.be.a('string').that.is.not.empty;
    expect(advanceRequest.body.bankAccountId).to.equal(bankAccount.id);
    expect(advanceRequest.body.outstanding).to.equal(2.01);
    expect(advanceRequest.body.delivery).to.equal('express');
    expect(advanceRequest.body.disbursementStatus).to.equal('PENDING');
    expect(advanceRequest.body.created).to.be.a('string').that.is.not.empty;
    expect(advanceRequest.body.expectedDelivery).to.be.a('string').that.is.not.empty;

    // check advance table for advance record
    const advanceId = advanceRequest.body.id;
    const advance = await Advance.findByPk(advanceId);
    const advanceTip = await advance.getAdvanceTip();

    expect(advance.id).to.equal(advanceId);
    expect(advance.deleted).to.be.an('object');
    expect(advance.userId).to.equal(user.id);
    expect(advance.bankAccountId).to.equal(bankAccount.id);
    expect(advance.disbursementBankTransactionId).to.be.null;
    expect(advance.paymentMethodId).to.equal(paymentMethod.id);
    expect(advance.chosenAdvanceApprovalId).to.be.a('number');
    expect(advance.paybackFrozen).to.equal(false);
    expect(advance.externalId).to.be.a('string').that.is.not.empty;
    expect(advance.referenceId).to.be.a('string').that.is.not.empty;
    expect(advance.amount).to.equal(0.02);
    expect(advance.fee).to.equal(1.99);
    expect(advanceTip.amount).to.equal(0);
    expect(advanceTip.percent).to.equal(0);
    expect(advance.outstanding).to.equal(2.01);
    expect(advance.disbursementStatus).to.equal('PENDING');
    expect(advance.paybackDate.format('YYYY-MM-DD')).to.equal(defaultPaybackDate);
    expect(advance.legacyId).to.be.null;
    expect(advance.disbursementProcessor).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(advance.delivery).to.equal('EXPRESS');
    expect(advance.modifications).to.be.an('array').that.is.not.empty;
    expect(advance.screenshotImage).to.be.null;
    expect(advance.createdDate.format('YYYY-MM-DD')).to.equal(moment().format('YYYY-MM-DD'));

    // fetch external transactions
    const externalTransactions = await fetchExternalTransactions(
      advance.externalId,
      'advance-disbursement',
    );

    expect(externalTransactions.status).to.equal('ok');
    expect(externalTransactions.results.length).to.equal(1);
    expect(externalTransactions.results[0].type).to.equal('advance-disbursement');
    expect(externalTransactions.results[0].externalId).to.equal(advance.externalId);
    expect(externalTransactions.results[0].referenceId).to.equal(advance.referenceId);
    expect(externalTransactions.results[0].amount).to.equal(advance.amount);
    expect(externalTransactions.results[0].gateway).to.equal(ExternalTransactionProcessor.Tabapay);
    expect(externalTransactions.results[0].outcome).to.be.an('object').that.is.empty;
    expect(externalTransactions.results[0].processor).to.equal(advance.disbursementProcessor);
    expect(externalTransactions.results[0].raw.SC).to.equal(200);
    expect(externalTransactions.results[0].raw.EC).to.equal('0');
    expect(externalTransactions.results[0].raw.referenceID).to.be.a('string').that.is.not.empty;
    expect(externalTransactions.results[0].raw.network).to.equal('Visa');
    expect(externalTransactions.results[0].raw.status).to.equal('UNKNOWN');
    expect(externalTransactions.results[0].raw.errors[0]).to.equal('000E7740');
    expect(externalTransactions.results[0].raw.errors[1]).to.equal('24000000');
    expect(externalTransactions.results[0].raw.errors[2]).to.equal('24');
    expect(externalTransactions.results[0].raw.amount).to.equal(advance.amount.toString());
    expect(externalTransactions.results[0].raw.last4).to.equal('9990');
    expect(externalTransactions.results[0].reversalStatus).to.equal('FAILED');
    expect(externalTransactions.results[0].status).to.equal('PENDING');
    expect(externalTransactions.results[0].isSettlement).to.equal(false);
  }).timeout(300000);
});
