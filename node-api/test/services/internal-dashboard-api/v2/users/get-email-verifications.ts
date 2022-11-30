import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';

describe('GET /v2/users/:id/email-verifications', () => {
  before(() => clean());

  afterEach(() => clean());

  it('responds with all email verifications for a user', async () => {
    const { id: userId } = await factory.create('user');

    const emailVerifications = await Promise.all([
      factory.create('email-verification', { userId }),
      factory.create('email-verification', { userId }),
      factory.create('email-verification', { userId }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/email-verifications`));

    expect(data).to.have.length(emailVerifications.length);
  });

  it('includes serialized email verification data', async () => {
    const { id: userId } = await factory.create('user');

    const emailVerification = await factory.create('email-verification', { userId });

    const {
      body: {
        data: [emailVerificationResponse],
      },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/email-verifications`));

    expect(emailVerificationResponse.type).to.equal('email-verification');
    expect(emailVerificationResponse.id).to.equal(`${emailVerification.id}`);
    expect(emailVerificationResponse.attributes).to.include({
      userId: emailVerification.userId,
      email: emailVerification.email,
      verified: null,
    });
    expect(emailVerificationResponse.attributes.created).to.be.a('string');
    expect(emailVerificationResponse.attributes.updated).to.be.a('string');
  });

  it('responds with an empty array if there are no email verifications for the user', async () => {
    const { id: userId } = await factory.create('user');

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/email-verifications`));

    expect(data.length).to.equal(0);
  });
});
