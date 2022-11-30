import * as sinon from 'sinon';
import { expect } from 'chai';
import { AuditLog, User } from '../../../../src/models';
import {
  AccountAction,
  AccountActionSuccess,
  AccountRemovalEvent,
} from '../../../../src/domain/account-management/account-action';
import { processBatchAccountActions } from '../../../../src/domain/account-management/account-action/processor';

describe('Account Management [Unit Tests] Processor', async () => {
  let userSpy: sinon.SinonStub;
  let auditLogSpy: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  before(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(async () => {
    sandbox.restore();
    sandbox.reset();
  });

  beforeEach(async () => {
    userSpy = sandbox.stub(User, 'create');
    auditLogSpy = sandbox.stub(AuditLog, 'create');
  });

  it('processBatchAccountActions(): should execute all batched actions and return a AccountActionSuccess when they all resolve successfully', async () => {
    const user: Partial<User> = { id: 1, email: 'foo@bar.com' };
    const successLog: Partial<AuditLog> = { id: 50, type: 'USER_SOFT_DELETED', successful: true };
    userSpy.resolves(user);
    auditLogSpy.resolves(successLog);

    const testUser = await User.create(user);

    const batchedActions = [
      new AccountAction('foo', 'remove', Promise.resolve(1)),
      new AccountAction('bar', 'remove', Promise.resolve(1)),
    ];
    const result = await processBatchAccountActions(
      'remove',
      batchedActions,
      testUser,
      AccountRemovalEvent,
    );

    expect(auditLogSpy.calledOnce).to.be.true;
    expect(result instanceof AccountActionSuccess).to.be.true;
  });
});
