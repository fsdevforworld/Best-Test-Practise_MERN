import * as request from 'supertest';
import app from '../../../src/services/recurring-transaction';
import { expect } from 'chai';
import factory from '../../factories';
import * as sinon from 'sinon';
import { clean } from '../../test-helpers';

describe('Recurring Transaction Get By Id', () => {
  const GetByIdPath = (id: number) => `/services/recurring-transaction/recurring-transaction/${id}`;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('should succeed with valid recurring transaction id', async () => {
    const transaction = await factory.create('recurring-transaction');

    const { body } = await request(app)
      .get(GetByIdPath(transaction.id))
      .expect(200);

    expect(body.id).to.deep.eq(transaction.id);
  });

  it('should fail if transaction does not exist', async () => {
    await request(app)
      .get(GetByIdPath(100000023))
      .expect(404);
  });
});
