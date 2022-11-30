import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';

import {
  AdvanceApproval,
  BankAccount,
  Payment,
  RecurringTransaction,
} from '../../../../src/models';

import {
  buildIntegrationTestUser,
  clean,
  fakeDateTime,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
} from '../../../test-helpers';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import * as DataEngine from '../../../../src/services/advance-approval/data-engine';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import factory from '../../../factories';
import { moment } from '@dave-inc/time-lib';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';

describe('Eligibility Rules', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let getBankAccountStub: sinon.SinonStub;
  let getIncomeStub: sinon.SinonStub;
  let recurringTransaction: RecurringTransaction;

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser());
    getBankAccountStub = sandbox
      .stub(HeathClient, 'getBankAccount')
      .returns(getApprovalBankAccount(bankAccount));
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    getIncomeStub = sandbox
      .stub(RecurringTransactionClient, 'getIncomes')
      .resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  it('should fail if bank account does not have account routing', async () => {
    ({ bankAccount } = await buildIntegrationTestUser());
    await bankAccount.eraseAccountRouting();
    getBankAccountStub.returns(getApprovalBankAccount(bankAccount));
    const {
      body: [body],
    } = await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone: 'America/New_York',
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      });
    expect(body.approved).to.equal(false);
    expect(body.primaryRejectionReason.type).to.equal('micro-deposit-incomplete');
  });

  it('should fail if user made recent payment and display time user can take next advance according to device timezone', async () => {
    fakeDateTime(sandbox, moment('2020-12-04T00:46:00Z'));
    await factory.create<Payment>('payment', {
      userId: bankAccount.userId,
      created: moment().subtract(12, 'hours'),
    });
    const userTimezone = 'America/New_York';
    sandbox.stub(DataEngine, 'publishApprovalEvents');
    await request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone,
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
        amount: 75,
      })
      .expect(200)
      .then(res => {
        expect(res.body[0].approved).to.equal(false);
        expect(res.body[0].primaryRejectionReason.message).to.match(
          /Your payment is pending. Check back on Fri, Dec 04 at 8:00 AM to try and get another advance./,
        );
      });
  });

  it('should fail if account has no predicted paycheck', async () => {
    getIncomeStub.resolves([]);
    return request(app)
      .post(CreateApprovalPath)
      .send({
        bankAccountId: bankAccount.id,
        advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
        userTimezone: 'America/New_York',
        userId: bankAccount.userId,
        trigger: AdvanceApprovalTrigger.UserTerms,
        auditLog: true,
      })
      .expect(200)
      .then(res => {
        expect(res.body[0].approved).to.equal(false);
        expect(res.body[0].rejectionReasons[0].message).to.match(/reliable income/);
      });
  });

  context('eligibility fails', () => {
    it('fail with "one-advance" normal advance', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: {
            totalAdvancesTaken: 1,
            outstandingAdvance: { amount: 50, outstanding: 50 },
          },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200)
        .then(res => {
          expect(res.body[0].primaryRejectionReason.message).to.include(
            'I need to get paid back the',
          );
          expect(res.body[0].primaryRejectionReason.message).to.include(
            'you owe before I can advance you anymore.',
          );
        });
      const log = await AdvanceApproval.findOne({ where: { userId: bankAccount.userId } });
      expect(log.approved).to.equal(false);
      expect(log.normalAdvanceApproved).to.equal(false);
      expect(log.microAdvanceApproved).to.equal(false);
    });

    it('fail "one-advance" micro advance', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: {
            totalAdvancesTaken: 1,
            outstandingAdvance: { amount: 50, outstanding: 50 },
          },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200)
        .then(res => {
          expect(res.body[0].primaryRejectionReason.message).to.include(
            'I need to get paid back the',
          );
          expect(res.body[0].primaryRejectionReason.message).to.include(
            'you owe before I can advance you anymore.',
          );
        });
      const log = await AdvanceApproval.findOne({ where: { userId: bankAccount.userId } });
      expect(log.approved).to.equal(false);
      expect(log.normalAdvanceApproved).to.equal(false);
      expect(log.microAdvanceApproved).to.equal(false);
    });
  });
});
