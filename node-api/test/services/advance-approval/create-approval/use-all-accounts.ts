import { expect } from 'chai';
import * as request from 'supertest';
import * as sinon from 'sinon';
import { set } from 'lodash';

import { BankAccount, RecurringTransaction, User } from '../../../../src/models';

import {
  buildIntegrationTestUser,
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
  stubUnderwritingML,
} from '../../../test-helpers';
import app, { CreateApprovalPath } from '../../../../src/services/advance-approval';
import { AdvanceApprovalTrigger } from '../../../../src/services/advance-approval/types';
import HeathClient from '../../../../src/lib/heath-client';
import { getApprovalBankAccount } from '../../../../src/domain/advance-approval-request';
import * as Bluebird from 'bluebird';
import RecurringTransactionClient from '../../../../src/services/advance-approval/recurring-transaction-client';
import { moment } from '@dave-inc/time-lib';

describe('Create Advance with useAllAccounts = true', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  let bankAccount: BankAccount;
  let recurringTransaction: RecurringTransaction;
  let user: User;
  let bankAccounts: BankAccount[];
  let mlStub: sinon.SinonStub;

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
    ({ bankAccount, user, recurringTransaction } = await buildIntegrationTestUser());
    bankAccounts = [bankAccount];
    sandbox.stub(BankAccount, 'getAccountAgeFromBankTransactionsByBankAccountId').resolves(90);
    mlStub = stubUnderwritingML(sandbox, { score: 1 });
    sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([recurringTransaction]);
    sandbox.stub(RecurringTransactionClient, 'getNextExpectedTransaction').resolves({
      expectedDate: moment()
        .add(3, 'days')
        .ymd(),
    });
  });

  afterEach(() => clean(sandbox));

  context('when accounts do not exist', () => {
    beforeEach(() => {
      sandbox.stub(HeathClient, 'getPrimaryBankAccounts').callsFake(() => {
        const error = new Error();
        set(error, 'code', 404);
        throw error;
      });
    });

    it('should return NotFoundError', () => {
      return request(app)
        .post(CreateApprovalPath)
        .send({
          useAllBankAccounts: true,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(404);
    });
  });

  context('when at least one account exists', () => {
    beforeEach(async () => {
      sandbox.stub(HeathClient, 'getPrimaryBankAccounts').callsFake(() => {
        return Bluebird.map(bankAccounts, b => getApprovalBankAccount(b));
      });
    });

    it('should return successful approval if only one bank account exists', () => {
      return request(app)
        .post(CreateApprovalPath)
        .send({
          useAllBankAccounts: true,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200)
        .then(res => {
          expect(res.body[0]).to.contain({
            approved: true,
            bankAccountId: bankAccount.id,
          });
          expect(res.body[0].approvedAmounts).to.deep.eq([50, 75, 100]);
        });
    });

    it('should return bank of dave approval if 2 exist', async () => {
      const { bankAccount: bodAccount } = await buildIntegrationTestUser({
        user,
        isBodBankAccount: true,
      });
      bankAccounts.push(bodAccount);
      return request(app)
        .post(CreateApprovalPath)
        .send({
          useAllBankAccounts: true,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200)
        .then(res => {
          expect(res.body[0]).to.contain({
            approved: true,
            bankAccountId: bodAccount.id,
          });
          expect(res.body[0].approvedAmounts).to.deep.eq([50, 75, 100]);
          expect(res.body[1]).to.contain({
            approved: true,
            bankAccountId: bankAccount.id,
          });
          expect(res.body[1].approvedAmounts).to.deep.eq([50, 75, 100]);
        });
    });

    it('should return other approval if greater than BOD', async () => {
      const { bankAccount: bodAccount } = await buildIntegrationTestUser({
        user,
        isBodBankAccount: true,
      });
      bankAccounts.push(bodAccount);
      mlStub.callsFake(async ({ bankAccountId }) => {
        if (bankAccountId === bodAccount.id) {
          return { score: 0.8 };
        }
        return { score: 1 };
      });
      return request(app)
        .post(CreateApprovalPath)
        .send({
          useAllBankAccounts: true,
          advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
          userTimezone: 'America/New_York',
          userId: bankAccount.userId,
          trigger: AdvanceApprovalTrigger.UserTerms,
          auditLog: true,
        })
        .expect(200)
        .then(res => {
          expect(res.body[0]).to.contain({
            approved: true,
            bankAccountId: bankAccount.id,
          });
          expect(res.body[0].approvedAmounts).to.deep.eq([50, 75, 100]);
          expect(res.body[1]).to.contain({
            approved: true,
            bankAccountId: bodAccount.id,
          });
          expect(res.body[1].approvedAmounts).to.deep.eq([5, 10]);
        });
    });
  });
});
