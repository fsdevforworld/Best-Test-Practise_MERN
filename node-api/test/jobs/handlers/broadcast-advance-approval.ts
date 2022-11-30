import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean, stubBankTransactionClient } from '../../test-helpers';
import { broadcastAdvanceApproval } from '../../../src/jobs/handlers';
import braze from '../../../src/lib/braze';
import { moment } from '@dave-inc/time-lib';
import { AuditLog, BankAccount, User } from '../../../src/models';
import { recordEvent } from '../../../src/domain/event';
import AdvanceApprovalClient from '../../../src/lib/advance-approval-client';

describe('Job: broadcast-advance-approval', () => {
  const sandbox = sinon.createSandbox();
  const advanceApprovalStub = [
    {
      approved: true,
      approvedAmounts: [25, 50, 75],
      expected: { expectedDate: moment() },
    },
  ];

  let bankAccount: BankAccount;
  let user: User;

  before(() => clean(sandbox));

  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    user = await factory.create('user', { id: 1 });
    bankAccount = await factory.create('checking-account', { userId: user.id });
  });

  afterEach(() => clean(sandbox));

  it('sends an `auto apply approved` event to Braze - if user is approved', async () => {
    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves(advanceApprovalStub);
    const brazeTrackSpy = sandbox.spy(braze, 'track');
    const job = { bankAccountId: bankAccount.id };
    await broadcastAdvanceApproval(job);
    sinon.assert.calledOnce(brazeTrackSpy);
  });

  it('sends an record event event', async () => {
    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves(advanceApprovalStub);
    const recordStub = sandbox.stub(recordEvent, 'publish');
    const job = { bankAccountId: bankAccount.id };
    await broadcastAdvanceApproval(job);
    sinon.assert.calledOnce(recordStub);
    expect(recordStub.firstCall.args[0].table).to.eq('advance_approval_event');
  });

  it('will not fail if expected is null', async () => {
    const approvalStub: any = [
      {
        approved: true,
        approvedAmounts: [25, 50, 75],
        expected: null,
      },
    ];
    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves(approvalStub);
    const job = { bankAccountId: bankAccount.id };
    await broadcastAdvanceApproval(job);
  });

  it('will request an advance with ml on and mlUseCacheOnly true', async () => {
    const approvalStub: any = [
      {
        approved: true,
        approvedAmounts: [25, 50, 75],
        expected: null,
      },
    ];
    const stub = sandbox
      .stub(AdvanceApprovalClient, 'createAdvanceApproval')
      .resolves(approvalStub);
    const job = { bankAccountId: bankAccount.id };
    await broadcastAdvanceApproval(job);
    expect(stub.firstCall.args[0]).to.contain({
      auditLog: false,
      mlUseCacheOnly: true,
    });
  });

  it('creates an audit log of type `AUTO_APPLY_ADVANCE_APPROVED` - if user is approved', async () => {
    sandbox.stub(AdvanceApprovalClient, 'createAdvanceApproval').resolves(advanceApprovalStub);
    const auditLogCreateSpy = sandbox.spy(AuditLog, 'create');
    const job = { bankAccountId: bankAccount.id };
    await broadcastAdvanceApproval(job);
    sinon.assert.calledOnce(auditLogCreateSpy);
  });
});
