import * as request from 'supertest';
import app from '../../../src/services/recurring-transaction';
import { expect } from 'chai';
import factory from '../../factories';
import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import { RecurringTransactionStatus } from '@dave-inc/wire-typings';

describe('Recurring Transaction Get Income', () => {
  const GetIncomePath = (userId: number, bankAccountId: number) =>
    `/services/recurring-transaction/user/${userId}/bank-account/${bankAccountId}/income`;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('returns an empty array if user has no incomes', async () => {
    const bankAccount = await factory.create('bank-account');

    const { body } = await request(app)
      .get(GetIncomePath(bankAccount.userId, bankAccount.id))
      .expect(200);

    expect(body.length).to.eq(0);
  });

  it('returns incomes if the user has some', async () => {
    const income = await factory.create('recurring-transaction', { userAmount: 300 });
    await factory.create('recurring-transaction', {
      userAmount: -300,
      bankAccountId: income.bankAccountId,
      userId: income.userId,
    });

    const { body } = await request(app)
      .get(GetIncomePath(income.userId, income.bankAccountId))
      .expect(200);

    expect(body.length).to.eq(1);
    expect(body[0].id).to.eq(income.id);
  });

  it('will filter by status if provided', async () => {
    const income = await factory.create('recurring-transaction', {
      userAmount: 300,
      status: RecurringTransactionStatus.VALID,
    });
    const invalidName = await factory.create('recurring-transaction', {
      userAmount: 300,
      bankAccountId: income.bankAccountId,
      userId: income.userId,
      status: RecurringTransactionStatus.INVALID_NAME,
    });

    const { body } = await request(app)
      .get(
        GetIncomePath(invalidName.userId, income.bankAccountId) +
          `?status=${RecurringTransactionStatus.INVALID_NAME}`,
      )
      .expect(200);

    expect(body.length).to.eq(1);
    expect(body[0].id).to.eq(invalidName.id);
  });
});
