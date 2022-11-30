import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { expect } from 'chai';
import { clean, withInternalUser, createInternalUser } from '../../../../test-helpers';
import { InternalUser } from '../../../../../src/models';

describe('GET /dashboard/current_user', () => {
  const email = 'dave@dave.com';
  const roleName = 'overdraftAdmin';
  const req = request(app)
    .get('/dashboard/current_user')
    .expect(200);

  let internalUser: InternalUser;
  before(async () => {
    await clean();
    internalUser = await createInternalUser({
      roleAttrs: { name: roleName },
      internalUserAttrs: { email },
    });
  });

  after(() => clean());

  it('sends the correct email address', async () => {
    const res = await withInternalUser(req, internalUser);

    expect(res.body.email).to.equal(email);
  });

  it('includes role names', async () => {
    const res = await withInternalUser(req, internalUser);

    expect(res.body.roles).to.deep.equal([roleName]);
  });
});
