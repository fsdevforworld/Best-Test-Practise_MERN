import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Jobs from '../../src/jobs/data';
import { run } from '../../src/crons/auto-advance-approval';
import { BankAccount, User } from '../../src/models';
import { clean } from '../test-helpers';
import factory from '../factories';

describe('Task: auto-advance-approval', () => {
  const sandbox = sinon.createSandbox();
  let broadcastAdvanceApprovalStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(() => {
    broadcastAdvanceApprovalStub = sandbox.stub(Jobs, 'broadcastAdvanceApprovalTask');
  });
  afterEach(() => clean(sandbox));

  it('enqueues a job for users with: no active advances, no deleted bank account, valid credentials, and notifications enabled', async () => {
    const bankAccount = await factory.create('bank-account');

    await User.update(
      { defaultBankAccountId: bankAccount.id },
      { where: { id: bankAccount.userId } },
    );

    await factory.create('auto-approval-notification', {
      userId: bankAccount.userId,
      pushEnabled: true,
    });

    await run();

    const [job] = broadcastAdvanceApprovalStub.firstCall.args;
    expect(job.bankAccountId).to.be.equal(bankAccount.id);
  });

  [
    { eligibleUserCount: 50, batchSize: 50 },
    { eligibleUserCount: 50, batchSize: 10 },
    { eligibleUserCount: 50, batchSize: 1 },
    { eligibleUserCount: 1, batchSize: 1 },
  ].forEach(({ eligibleUserCount, batchSize }) => {
    it(`batches correctly with ${eligibleUserCount} users and batch size ${batchSize}`, async () => {
      const users = await factory.createMany<User>('user', eligibleUserCount);
      const bankAccounts = await factory.createMany<BankAccount>(
        'bank-account',
        users.map(({ id: userId }) => ({
          userId,
        })),
      );
      await Promise.all(
        bankAccounts.map(({ id: bankAccountId, userId }) => {
          const user = users.find(({ id }) => id === userId);

          return user.update({ defaultBankAccountId: bankAccountId });
        }),
      );

      await factory.createMany(
        'auto-approval-notification',
        users.map(({ id: userId }) => ({
          userId,
          pushEnabled: true,
        })),
      );

      await run();

      const jobs = broadcastAdvanceApprovalStub.getCalls();
      expect(jobs).to.have.length(users.length);
      const jobPayloads = jobs.map(sinonStubCalls => sinonStubCalls.args[0]);
      users.forEach(({ defaultBankAccountId }) => {
        expect(jobPayloads).to.deep.include({ bankAccountId: defaultBankAccountId });
      });
    });
  });

  it('should gracefully handle create tasks errors', async () => {
    const users = await factory.createMany<User>('user', 2);
    const bankAccounts = await factory.createMany<BankAccount>(
      'bank-account',
      users.map(({ id: userId }) => ({
        userId,
      })),
    );
    await Promise.all(
      bankAccounts.map(({ id: bankAccountId, userId }) => {
        const user = users.find(({ id }) => id === userId);

        return user.update({ defaultBankAccountId: bankAccountId });
      }),
    );

    await factory.createMany(
      'auto-approval-notification',
      users.map(({ id: userId }) => ({
        userId,
        pushEnabled: true,
      })),
    );

    // Enqueueing first bank account fails
    broadcastAdvanceApprovalStub
      .withArgs({ bankAccountId: bankAccounts[0].id })
      .throws(new Error('Enqueueing cloud task failed'));

    await run();

    // Ensure second bank account was successfully enqueued
    const jobs = await broadcastAdvanceApprovalStub.getCalls();
    expect(jobs).to.have.length(2);

    const jobPayloads = jobs.map(sinonStubCalls => sinonStubCalls.args[0]);
    users.forEach(({ defaultBankAccountId }) => {
      expect(jobPayloads).to.deep.include({ bankAccountId: defaultBankAccountId });
    });
  });
});
