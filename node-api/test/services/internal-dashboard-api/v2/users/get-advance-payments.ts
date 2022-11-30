import { expect } from 'chai';
import * as request from 'supertest';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import { Payment } from '../../../../../src/models';

describe('GET /v2/users/:userId/advance-payments', () => {
  beforeEach(() => clean());

  it('returns all advance payments associated with the user', async () => {
    const payment = await factory.create<Payment>('payment');

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(`/v2/users/${payment.userId}/payments`)
        .expect(200),
    );

    expect(data.length).to.equal(1);
    expect(data[0].type).to.equal('advance-payment');
    expect(data[0].id).to.equal(`${payment.id}`);
  });

  it('includes soft deleted payments', async () => {
    const payment = await factory.create<Payment>('payment');

    await payment.destroy();

    const {
      body: { data },
    } = await withInternalUser(
      request(app)
        .get(`/v2/users/${payment.userId}/payments`)
        .expect(200),
    );

    expect(data.length).to.equal(1);
    expect(data[0].type).to.equal('advance-payment');
    expect(data[0].id).to.equal(`${payment.id}`);
  });
});
