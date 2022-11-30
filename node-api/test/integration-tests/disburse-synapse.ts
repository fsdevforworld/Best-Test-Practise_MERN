import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../factories';
import {
  Advance,
  AdvanceApproval,
  BankAccount,
  PaymentMethod,
  SynapsepayDocument,
  User,
} from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import { fetchExternalTransactions, setupBankAccount, setupUser, STAGING_URL } from './helpers';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { getAvailableDatesForNoIncome } from '../../src/domain/advance-delivery';

describe('disburse advance via synapse', async () => {
  let bankAccount: BankAccount;
  let user: User;
  let paymentMethod: PaymentMethod;

  before(async () => {
    ({ bankAccount, user, paymentMethod } = await setupBankAccount());
    user = await setupUser(user, false);
  });

  it('should verify a users identity with synapse', async () => {
    // make an identity verification request
    const identityVerificationRequest = await request(STAGING_URL)
      .post('/v2/identity_verification/')
      .set('Authorization', user.id.toString())
      .set('X-Device-Id', user.id.toString())
      .set('X-App-Version', '2.12.0')
      .send({
        firstName: 'Test',
        lastName: 'Person',
        email: 'test@dave.com',
        addressLine1: '1269 South Cochran Avenue',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90019',
        birthdate: '1990-01-01',
        ssn: '222-22-2222',
      })
      .expect(200);

    // verify response from identity verification request
    expect(identityVerificationRequest.body.approved).to.equal(false);
    expect(identityVerificationRequest.body.status).to.equal('REVIEWING_DOC');
    expect(identityVerificationRequest.body.message).to.equal(
      'Identity documents are still under review',
    );

    // update indentity verification record in db to be valid
    await SynapsepayDocument.update(
      {
        ssnStatus: 'VALID',
        licenseStatus: 'VALID',
        permission: 'SEND-AND-RECEIVE',
      },
      {
        where: {
          userId: user.id,
        },
      },
    );
  }).timeout(300000);

  it('should disburse advance to bank account', async () => {
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
        delivery: 'standard',
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
    expect(advanceRequest.body.fee).to.equal(0);
    expect(advanceRequest.body.paybackDate).to.be.a('string').that.is.not.empty;
    expect(advanceRequest.body.bankAccountId).to.equal(bankAccount.id);
    expect(advanceRequest.body.outstanding).to.equal(0.03);
    expect(advanceRequest.body.delivery).to.equal('standard');
    expect(advanceRequest.body.disbursementStatus).to.equal('PENDING');
    expect(advanceRequest.body.created).to.be.a('string').that.is.not.empty;

    // reload bank account and verify synapse id is not null
    await bankAccount.reload();
    expect(bankAccount.synapseNodeId).to.not.be.null;
    expect(bankAccount.synapseNodeId).to.be.a('string').that.is.not.empty;

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
    expect(advance.fee).to.equal(0);
    expect(advanceTip.amount).to.equal(0);
    expect(advanceTip.percent).to.equal(0);
    expect(advance.outstanding).to.equal(0.03);
    expect(advance.disbursementStatus).to.equal('PENDING');
    expect(advance.paybackDate.format('YYYY-MM-DD')).to.equal(defaultPaybackDate);
    expect(advance.legacyId).to.be.null;
    expect(advance.disbursementProcessor).to.equal(ExternalTransactionProcessor.Synapsepay);
    expect(advance.delivery).to.equal('STANDARD');
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
    expect(externalTransactions.results[0].externalId).to.equal(advance.externalId);
    expect(externalTransactions.results[0].referenceId).to.equal(advance.referenceId);
    expect(externalTransactions.results[0].amount).to.equal(advance.amount);
    expect(externalTransactions.results[0].gateway).to.equal(
      ExternalTransactionProcessor.Synapsepay,
    );
    expect(externalTransactions.results[0].outcome.message).to.equal('Transaction Created.');
    expect(externalTransactions.results[0].processor).to.equal(advance.disbursementProcessor);
    expect(externalTransactions.results[0].reversalStatus).to.be.null;
    expect(externalTransactions.results[0].status).to.equal('PENDING');
    expect(externalTransactions.results[0].isSettlement).to.equal(false);
  }).timeout(300000);
});
