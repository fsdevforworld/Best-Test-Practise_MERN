import * as request from 'supertest';
import { expect } from 'chai';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';

describe('GET /v2/users/:id/subscription-billings', () => {
  before(() => clean());

  afterEach(() => clean());

  it(`responds with all the subscription billings that belong to the user`, async () => {
    const user = await factory.create('user');

    const billingTestParams = {
      amount: 1,
      userId: user.id,
      billingCycle: '2020-09',
      dueDate: '2020-09-05',
    };

    const billing = await factory.create('subscription-billing', billingTestParams);

    const {
      body: {
        data: [billingResponse],
      },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/subscription-billings`));

    expect(billingResponse.type).to.equal('subscription-billing');
    expect(billingResponse.id).to.equal(`${billing.id}`);
    expect(billingResponse.attributes).to.include({
      userId: billing.userId,
      ...billingTestParams,
    });
    expect(billingResponse.attributes.status).to.exist;
  });

  it('responds with an empty array if there are no billings for the user', async () => {
    const user = await factory.create('user');

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/subscription-billings`));

    expect(data.length).to.equal(0);
  });
});
