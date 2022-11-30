import { expect } from 'chai';
import * as sinon from 'sinon';
import { InternalRole } from '../../../../../src/models';
import { syncAllRoles } from '../../../../../src/services/internal-dashboard-api/domain/sync-roles';
import * as RoleSync from '../../../../../src/services/internal-dashboard-api/domain/sync-roles/sync-role';
import { createDirectoryClient } from '../../../../../src/services/internal-dashboard-api/lib/directory-api';
import factory from '../../../../factories';
import { clean } from '../../../../test-helpers';

describe('syncAllRoles', () => {
  const sandbox = sinon.createSandbox();
  const directoryApi = createDirectoryClient();

  before(() => clean());

  afterEach(() => clean(sandbox));

  it('calls syncRole for each internal role', async () => {
    const [roleA, roleB] = await Promise.all([
      factory.create<InternalRole>('internal-role'),
      factory.create<InternalRole>('internal-role'),
    ]);

    const spy = sandbox.stub(RoleSync, 'default').resolves();

    const result = await syncAllRoles(directoryApi);

    expect(spy.callCount).to.equal(2);

    expect(result).to.deep.include({
      roleName: roleA.name,
      outcome: 'success',
    });

    expect(result).to.deep.include({
      roleName: roleB.name,
      outcome: 'success',
    });
  });

  it('can return failed as the outcome for a role', async () => {
    const role = await factory.create<InternalRole>('internal-role');

    sandbox.stub(RoleSync, 'default').rejects(new Error('This was an error'));

    const result = await syncAllRoles(directoryApi);

    expect(result).to.deep.equal([{ roleName: role.name, outcome: 'failed' }]);
  });
});
