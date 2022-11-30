import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { User, Role } from '../../../../../src/models';
import { moment } from '@dave-inc/time-lib';

describe('GET /v2/users/:id/roles', () => {
  before(() => clean());

  afterEach(() => clean());

  let user: User;
  let role: Role;

  beforeEach(async () => {
    user = await factory.create('user');

    role = await factory.create('role');
  });

  it('responds with all roles for a user', async () => {
    const userRoles = await Promise.all([
      factory.create('user-role', { userId: user.id, roleId: role.id }),
      factory.create('user-role', { userId: user.id, roleId: role.id }),
      factory.create('user-role', { userId: user.id, roleId: role.id }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/roles`));

    expect(data).to.have.length(userRoles.length);
  });

  it('only includes user roles for non deleted roles', async () => {
    const [activeRole, deletedRole] = await Promise.all([
      factory.create('role'),
      factory.create('role', { deleted: moment() }),
    ]);

    await Promise.all([
      factory.create('user-role', { userId: user.id, roleId: activeRole.id }),
      factory.create('user-role', { userId: user.id, roleId: deletedRole.id }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/roles`));

    expect(data).to.have.length(1);
  });

  it('includes serialized role data', async () => {
    await factory.create('user-role', { userId: user.id, roleId: role.id });

    const {
      body: {
        data: [roleResponse],
      },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/roles`));

    expect(roleResponse.type).to.equal('role');
    expect(roleResponse.id).to.equal(`${role.id}`);
    expect(roleResponse.attributes).to.include({
      name: role.name,
    });
  });

  it('responds with an empty array if there are no roles for the user', async () => {
    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user.id}/roles`));

    expect(data.length).to.equal(0);
  });
});
