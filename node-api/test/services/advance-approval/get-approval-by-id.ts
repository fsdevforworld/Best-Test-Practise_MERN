import * as request from 'supertest';
import app, { GetApprovalByIdPath } from '../../../src/services/advance-approval';
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

  it('should succeed with valid approval id', async () => {
    const userId = 1;
    const [approvalBankAccount] = await Promise.all([
      factory.create('bank-account', { userId }),
      factory.create('bod-checking-account', { userId }),
    ]);
    const approval = await factory.create('advance-approval', {
      bankAccountId: approvalBankAccount.id,
      userId,
    });

    const { body } = await request(app)
      .get(GetApprovalByIdPath(approval.id))
      .expect(200);

    expect(body.id).to.deep.eq(approval.id);
  });

  it('should return expired if the approval then a day old', async () => {
    const bankAccount = await factory.create('bank-account');
    const approval = await factory.create('advance-approval', {
      created: moment().subtract(2, 'days'),
      bankAccountId: bankAccount.id,
      userId: bankAccount.userId,
    });

    const { body } = await request(app)
      .get(GetApprovalByIdPath(approval.id))
      .expect(200);

    expect(body.expired).to.eq(true);
  });

  it('should fail if approval does not exist', async () => {
    await request(app)
      .get(GetApprovalByIdPath(100000023))
      .expect(404);
  });
});
