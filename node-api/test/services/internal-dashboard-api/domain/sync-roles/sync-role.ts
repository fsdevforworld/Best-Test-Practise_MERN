import { expect } from 'chai';
import { admin_directory_v1 } from 'googleapis';
import * as sinon from 'sinon';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { createDirectoryClient } from '../../../../../src/services/internal-dashboard-api/lib/directory-api';
import { syncRole } from '../../../../../src/services/internal-dashboard-api/domain/sync-roles';
import { InternalUser, InternalRole } from '../../../../../src/models';

describe('syncRole', () => {
  const sandbox = sinon.createSandbox();
  const directoryApi = createDirectoryClient();

  function stubDirectoryResponse(emails: string[]) {
    const members: admin_directory_v1.Schema$Member[] = emails.map(email => {
      return { email };
    });

    sandbox.stub(directoryApi.members, 'list').resolves({
      data: {
        members,
      },
    });
  }

  async function assertUserHasRoles(internalUser: InternalUser, roleNames: string[]) {
    const roles = await internalUser.getInternalRoleNames();
    expect(roles).to.deep.equal(roleNames);
  }

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('adds the role to the internal user', async () => {
    const [internalUser, role] = await Promise.all([
      factory.create<InternalUser>('internal-user'),
      factory.create<InternalRole>('internal-role'),
    ]);

    stubDirectoryResponse([internalUser.email]);

    await syncRole(role, directoryApi);

    await assertUserHasRoles(internalUser, [role.name]);
  });

  it('removes the role if they are no longer a member of the group', async () => {
    const [internalUser, role] = await Promise.all([
      factory.create<InternalUser>('internal-user'),
      factory.create<InternalRole>('internal-role'),
    ]);

    await role.setInternalUsers([internalUser]);

    stubDirectoryResponse(['foo@dave.com']);

    await syncRole(role, directoryApi);

    await assertUserHasRoles(internalUser, []);
  });

  it('creates an internal user if they do not exist', async () => {
    const role = await factory.create<InternalRole>('internal-role');
    const email = 'foo@dave.com';

    stubDirectoryResponse([email]);

    await syncRole(role, directoryApi);

    const internalUser = await InternalUser.findOne({
      where: {
        email,
      },
      rejectOnEmpty: true,
    });

    expect(internalUser.email).to.equal(email);

    await assertUserHasRoles(internalUser, [role.name]);
  });

  it('updates the lastSync field', async () => {
    const role = await factory.create<InternalRole>('internal-role');

    stubDirectoryResponse([]);

    await syncRole(role, directoryApi);

    await role.reload();

    expect(role.lastSync).to.exist;
  });
});
