import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../factories';
import { Advance, AdvanceApproval, BankAccount, PaymentMethod, User } from '../../src/models';
import {
  createTabapayCard,
  fetchExternalTransactions,
  setSynapseNodeId,
  setupBankAccount,
  setupUser,
  STAGING_URL,
} from './helpers';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { getAvailableDatesForNoIncome } from '../../src/domain/advance-delivery';

describe('disburse advance via tabapay', async () => {
  let bankAccount: BankAccount;
  let user: User;
  let paymentMethod: PaymentMethod;

  before(async () => {
    ({ bankAccount, user, paymentMethod } = await setupBankAccount());

    await factory.create('synapsepay-document', {
      userId: bankAccount.userId,
    });
    user = await setupUser(user, true);
    bankAccount = await setSynapseNodeId(bankAccount);
  });

  it('should create a tabapay card', async () => {
    const tabapayCard = await createTabapayCard(user, bankAccount);

    // verify result from tabapay card creation
    expect(tabapayCard.success).to.equal(true);
    expect(tabapayCard.message).to.equal('Debit card added and verified.');
    expect(tabapayCard.paymentMethodId).to.be.a('number');

    // verify payment method record added to db and set payment method
    const { paymentMethodId } = tabapayCard;
    paymentMethod = await PaymentMethod.findByPk(paymentMethodId);

    expect(paymentMethod.id).to.equal(paymentMethodId);
    expect(paymentMethod.bankAccountId).to.equal(bankAccount.id);
    expect(paymentMethod.userId).to.equal(user.id);
    expect(paymentMethod.availability).to.equal('immediate');
    expect(paymentMethod.risepayId).to.be.null;
    expect(paymentMethod.tabapayId).to.be.a('string').that.is.not.empty;
    expect(paymentMethod.mask).to.equal('9990');
    expect(paymentMethod.displayName).to.equal('Other: 9990');
    expect(paymentMethod.expiration).to.be.an('object');
    expect(paymentMethod.scheme).to.equal('other');
    expect(paymentMethod.zipCode).to.equal('90019');
    expect(paymentMethod.linked).to.equal(false);
    expect(paymentMethod.invalid).to.be.null;
    expect(paymentMethod.invalidReasonCode).to.be.null;
    expect(paymentMethod.optedIntoDaveRewards).to.equal(false);
    expect(paymentMethod.empyrCardId).to.be.null;
    expect(paymentMethod.bin).to.equal('940011');
    expect(paymentMethod.deleted).to.be.null;
  }).timeout(300000);

  it('should disburse advance to debit card', async () => {
    // create a recurring transaction to be used as main paycheck
    const recurringTransaction = await factory.create('recurring-transaction', {
      bankAccountId: bankAccount.id,
      userId: user.id,
      userAmount: 400,
    });
    bankAccount.mainPaycheckRecurringTransactionId = recurringTransaction.id;
    await bankAccount.save();

    const availablePaybackDates = await getAvailableDatesForNoIncome();
    const defaultPaybackDate = availablePaybackDates[0];

    // create advance approval
    await AdvanceApproval.create({
      recurringTransactionId: recurringTransaction.id,
      userId: user.id,
      bankAccountId: bankAccount.id,
      approvedAmounts: [0.03, 0.05, 0.08],
      normalAdvanceApproved: false,
      microAdvanceApproved: true,
      approved: true,
      rejectionReasons: [],
      defaultPaybackDate,
    });

    // request advance
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
        amount: 0.03,
      })
      .expect(200);

    // verify response from advance request
    expect(advanceRequest.body.id).to.be.a('number');
    expect(advanceRequest.body.amount).to.equal(0.03);
    expect(advanceRequest.body.tip).to.equal(0);
    expect(advanceRequest.body.tipPercent).to.equal(0);
    expect(advanceRequest.body.fee).to.equal(1.99);
    expect(advanceRequest.body.paybackDate).to.be.a('string').that.is.not.empty;
    expect(advanceRequest.body.bankAccountId).to.equal(bankAccount.id);
    expect(advanceRequest.body.outstanding).to.equal(2.02);
    expect(advanceRequest.body.delivery).to.equal('express');
    expect(advanceRequest.body.disbursementStatus).to.equal('COMPLETED');
    expect(advanceRequest.body.created).to.be.a('string').that.is.not.empty;

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
    expect(advance.amount).to.equal(0.03);
    expect(advance.fee).to.equal(1.99);
    expect(advanceTip.amount).to.equal(0);
    expect(advanceTip.percent).to.equal(0);
    expect(advance.outstanding).to.equal(2.02);
    expect(advance.disbursementStatus).to.equal('COMPLETED');
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
    expect(externalTransactions.results[0].outcome.code).to.equal('00');
    expect(externalTransactions.results[0].processor).to.equal(advance.disbursementProcessor);
    expect(externalTransactions.results[0].raw.SC).to.equal(200);
    expect(externalTransactions.results[0].raw.EC).to.equal('0');
    expect(externalTransactions.results[0].raw.referenceID).to.be.a('string').that.is.not.empty;
    expect(externalTransactions.results[0].raw.network).to.equal('Visa');
    expect(externalTransactions.results[0].raw.networkRC).to.equal('00');
    expect(externalTransactions.results[0].raw.status).to.equal('COMPLETED');
    expect(externalTransactions.results[0].raw.approvalCode).to.be.a('string').that.is.not.empty;
    expect(externalTransactions.results[0].raw.amount).to.equal(advance.amount.toString());
    expect(externalTransactions.results[0].raw.last4).to.equal('9990');
  }).timeout(300000);
});
