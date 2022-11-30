import * as request from 'supertest';
import app from '../../../src/services/recurring-transaction';
import { expect } from 'chai';
import factory from '../../factories';
import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import { moment } from '@dave-inc/time-lib';

describe('Recurring Transaction Get Next Expected', () => {
  const NextExpectedPath = (recurringTransactionId: number) =>
    `/services/recurring-transaction/recurring-transaction/${recurringTransactionId}/expected-transaction/next`;

  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('returns a 404 if the recurring does not exist', async () => {
    await request(app)
      .get(NextExpectedPath(10000))
      .expect(404);
  });

  it('returns the next expected after today', async () => {
    const income = await factory.create('recurring-transaction', {
      userAmount: 300,
      interval: 'WEEKLY',
      params: [
        moment()
          .format('dddd')
          .toLowerCase(),
      ],
    });

    const { body } = await request(app)
      .get(NextExpectedPath(income.id))
      .expect(200);

    expect(body.expectedDate).to.eq(
      moment()
        .add(1, 'week')
        .ymd(),
    );
  });

  it('will return today if due today and after is yesterday', async () => {
    const income = await factory.create('recurring-transaction', {
      userAmount: 300,
      interval: 'WEEKLY',
      params: [
        moment()
          .format('dddd')
          .toLowerCase(),
      ],
    });

    const { body } = await request(app)
      .get(
        NextExpectedPath(income.id) +
          `?after=${moment()
            .subtract(1, 'day')
            .format()}`,
      )
      .expect(200);

    expect(body.expectedDate).to.eq(moment().ymd());
  });
});
