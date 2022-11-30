import * as request from 'supertest';
import app, { GetApprovalPath } from '../../../src/services/advance-approval';
import { expect } from 'chai';
import factory from '../../factories';
import * as sinon from 'sinon';
import {
  clean,
  stubBalanceLogClient,
  stubBankTransactionClient,
  stubLoomisClient,
  stubPredictedPaybackML,
} from '../../test-helpers';
import { moment } from '@dave-inc/time-lib';
import RecurringTransactionClient from '../../../src/services/advance-approval/recurring-transaction-client';

describe('Get Approval', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(async () => {
    stubPredictedPaybackML(sandbox);
    stubBankTransactionClient(sandbox);
    stubBalanceLogClient(sandbox);
    stubLoomisClient(sandbox);
  });

  afterEach(() => clean(sandbox));

  it('should succeed if recurring transaction id is not included', async () => {
    const approval = await factory.create('advance-approval');

    const { body } = await request(app)
      .get(GetApprovalPath)
      .query({
        amount: 75,
        bankAccountId: approval.bankAccountId,
      });

    expect(body.id).to.deep.eq(approval.id);
  });

  it("should fail if the provided recurring transaction id doesn't exist", async () => {
    const approval = await factory.create('advance-approval');
    sandbox.stub(RecurringTransactionClient, 'getById').resolves(null);

    await request(app)
      .get(GetApprovalPath)
      .query({
        amount: 75,
        bankAccountId: approval.bankAccountId,
        recurringTransactionId: 10000,
      })
      .expect(404);
  });

  it("should fail if the provided recurring transaction id isn't owned by the user", async () => {
    const recurringTransaction = await factory.create('recurring-transaction');
    const approval = await factory.create('advance-approval');
    sandbox.stub(RecurringTransactionClient, 'getById').resolves(recurringTransaction);

    await request(app)
      .get(GetApprovalPath)
      .query({
        amount: 75,
        bankAccountId: approval.bankAccountId,
        recurringTransactionId: recurringTransaction.id,
      })
      .expect(404);
  });

  it('should fail if advance approval is too old', async () => {
    const approval = await factory.create('advance-approval', {
      created: moment().subtract(3, 'hour'),
      approved: true,
    });

    await request(app)
      .get(GetApprovalPath)
      .query({
        amount: 75,
        bankAccountId: approval.bankAccountId,
      })
      .expect(404);
  });
});
