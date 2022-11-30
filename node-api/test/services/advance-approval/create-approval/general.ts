import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { set } from 'lodash';

import { AdvanceApproval, BankAccount, User } from '../../../../src/models';

import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
} from '../../../test-helpers';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import * as devSeed from '../../../../bin/dev-seed';
import RecurringTransaction from '../../../../src/models/recurring-transaction';
import { APPROVED_AMOUNTS_BY_MAX_AMOUNT } from '../../../../src/services/advance-approval/advance-approval-engine/common';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';
import { moment } from '@dave-inc/time-lib';

describe('Tests for create advance not node specific', () => {
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

  context('with HeathClient errors', () => {
    beforeEach(async () => {
      const error = new Error();
      set(error, 'code', 404);
      getBankAccountStub = sandbox.stub(HeathClient, 'getBankAccount').throws(error);
    });

    it('should return NotFoundError for missing bank account', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: 999999,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          appScreen: 'Advance',
        })
        .expect(404);
    });
  });

  context('when success', () => {
    beforeEach(async () => {
      getBankAccountStub = sandbox
        .stub(HeathClient, 'getBankAccount')
        .returns(getApprovalBankAccount(bankAccount));
    });

    it('should send audit log if from the right page', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          appScreen: 'Advance',
        });
      const logs = await AdvanceApproval.findAll({
        where: { userId: bankAccount.userId },
        order: [['created', 'DESC']],
      });
      expect(logs[0].approved).to.equal(true);
    });

    it('should include app screen in the audit log', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          appScreen: 'Advance',
        });
      const logs = await AdvanceApproval.findAll({
        where: { userId: bankAccount.userId },
        order: [['created', 'DESC']],
      });
      const log = logs.find(x => x.extra.appScreen === 'Advance');
      expect(log).not.to.be.undefined;
    });

    it('should not send audit log if from the wrong page', async () => {
      await request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          appScreen: 'Bacon',
        });
      const logs = await AdvanceApproval.findAll({
        where: { userId: bankAccount.userId },
        order: [['created', 'DESC']],
      });
      expect(logs.length).to.equal(0);
    });

    it('should send the advance engine description rules w/ some passing, failing and pending on a success w/ all required data', async () => {
      ({ bankAccount, recurringTransaction } = await buildIntegrationTestUser({
        failedSolvency: true,
        hasLowIncome: true,
      }));
      getIncomeStub.resolves([recurringTransaction]);
      const bankAccountResponse = await getApprovalBankAccount(bankAccount);
      getBankAccountStub.resolves(bankAccountResponse);

      return request(app)
        .post(CreateApprovalPath)
        .send({
          bankAccountId: bankAccount.id,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
          appScreen: 'Bacon',
        })
        .expect(200)
        .then(res => {
          expect(res.body[0].advanceEngineRuleDescriptions).to.be.deep.eq({
            passed: [
              'I get paid in the account I connected',
              'My account currently has a positive balance',
              'My bank account is at least a few months old',
              "I've gotten multiple paychecks deposited from the same employer on a regular schedule",
            ],
            failed: ['My paychecks average at least a few hundred dollars'],
            pending: [
              'I keep enough money in my account for a few days after payday to pay a few bills',
            ],
          });
        });
    });

    describe('secondary income test', () => {
      beforeEach(() => {
        return devSeed.main('up', ['donation-organization', 'secondary-income']);
      });
      it('should pass users with an income that is not the main income', async () => {
        const phoneNumber = '+11234577777';
        const user = await User.findOne({ where: { phoneNumber } });
        bankAccount = await BankAccount.findOne({ where: { userId: user.id } });

        const bankAccountResponse = await getApprovalBankAccount(bankAccount);
        getBankAccountStub.resolves(bankAccountResponse);

        const mainPaycheck = await RecurringTransaction.findByPk(
          bankAccount.mainPaycheckRecurringTransactionId,
        );
        getIncomeStub.resolves(
          await RecurringTransaction.findAll({
            where: { bankAccountId: bankAccount.id },
          }),
        );
        const approvedAmounts = APPROVED_AMOUNTS_BY_MAX_AMOUNT[75];
        await request(app)
          .post(CreateApprovalPath)
          .send({
            bankAccountId: bankAccount.id,
            advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
            userTimezone: 'America/New_York',
            userId: bankAccount.userId,
            trigger: AdvanceApprovalTrigger.UserTerms,
            auditLog: true,
            appScreen: 'Bacon',
          })
          .expect(200)
          .then(res => {
            expect(res.body[0].approved).to.equal(true);
            expect(res.body[0].advanceType).to.equal('NORMAL_ADVANCE');
            expect(res.body[0].approvedAmounts).to.deep.equal(approvedAmounts);
          });
        const logs = await AdvanceApproval.findAll({
          where: { userId: user.id },
          order: [['created', 'DESC']],
        });
        const log = logs.find(logLocal => logLocal.recurringTransactionId !== mainPaycheck.id);
        expect(log.approved).to.equal(true);
        expect(log.normalAdvanceApproved).to.equal(true);
        expect(log.microAdvanceApproved).to.equal(false);
        expect(log.extra.mainPaycheckId).to.equal(bankAccount.mainPaycheckRecurringTransactionId);
        expect(log.primaryRejectionReason).to.be.null;
      });

      it('should prefer primary even if there are multiple with same amount', async () => {
        const phoneNumber = '+11234577777';
        const user = await User.findOne({ where: { phoneNumber } });
        bankAccount = await user.getDefaultBankAccount();
        const recurring = await RecurringTransaction.findOne({
          where: { userId: user.id, userAmount: 500 },
        });
        await bankAccount.update({ mainPaycheckRecurringTransactionId: recurring.id });
        getIncomeStub.resolves(
          await RecurringTransaction.findAll({
            where: { bankAccountId: bankAccount.id },
          }),
        );
        await bankAccount.update({ mainPaycheckRecurringTransactionId: recurring.id });
        const bankAccountResponse = await getApprovalBankAccount(bankAccount);
        getBankAccountStub.resolves(bankAccountResponse);

        const approvedAmounts = APPROVED_AMOUNTS_BY_MAX_AMOUNT[75];

        await request(app)
          .post(CreateApprovalPath)
          .send({
            bankAccountId: bankAccount.id,
            advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
            userTimezone: 'America/New_York',
            userId: bankAccount.userId,
            trigger: AdvanceApprovalTrigger.UserTerms,
            auditLog: true,
            appScreen: 'Bacon',
          })
          .expect(200)
          .then(res => {
            expect(res.body[0].approved).to.equal(true);
            expect(res.body[0].advanceType).to.equal('NORMAL_ADVANCE');
            expect(res.body[0].approvedAmounts).to.deep.equal(approvedAmounts);
          });
        const logs = await AdvanceApproval.findAll({
          where: { userId: user.id },
          order: [
            ['created', 'DESC'],
            ['id', 'DESC'],
          ],
        });
        const log = logs.find(logLocal => logLocal.recurringTransactionId === recurring.id);
        expect(log.approved).to.equal(true);
        expect(log.normalAdvanceApproved).to.equal(true);
        expect(log.microAdvanceApproved).to.equal(false);
        expect(log.extra.mainPaycheckId).to.equal(recurring.id);
        expect(log.primaryRejectionReason).to.be.null;
      });
    });
  });
});
