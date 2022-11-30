import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import factory from '../../../../factories';
import {
  clean,
  createInternalUser,
  stubUserUpdateBroadcasts,
  withInternalUser,
} from '../../../../test-helpers';
import {
  BankAccount,
  DashboardActionLog,
  DashboardActionReason,
  DashboardUserModification,
  InternalUser,
  User,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';

describe('PATCH /v2/users/:id/default-bank-account', () => {
  const sandbox = sinon.createSandbox();
  const stubs: { [key: string]: sinon.SinonStub } = {};

  let user: User;
  let agent: InternalUser;
  let newBankAccount: BankAccount;
  let oldBankAccount: BankAccount;
  let dashboardAction;
  let dashboardActionReason: DashboardActionReason;
  let response: request.Response;

  before(async () => {
    await clean();

    const broadcastStubs = stubUserUpdateBroadcasts(sandbox);
    Object.assign(stubs, broadcastStubs);

    [user, agent, dashboardAction] = await Promise.all([
      factory.create<User>('user'),
      createInternalUser(),
      factory.create('dashboard-action', {
        code: ActionCode.UpdateDefaultBankAccount,
      }),
    ]);

    [oldBankAccount, newBankAccount, dashboardActionReason] = await Promise.all([
      factory.create<BankAccount>('checking-account', {
        userId: user.id,
      }),
      factory.create<BankAccount>('checking-account', {
        userId: user.id,
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
      }),
    ]);

    const [oldBankConnection] = await Promise.all([
      oldBankAccount.getBankConnection(),
      user.update({ defaultBankAccountId: oldBankAccount.id }),
    ]);

    await oldBankConnection.update({ primaryBankAccountId: oldBankAccount.id });
  });

  after(() => clean(sandbox));

  context('a valid update request', () => {
    before(async () => {
      const req = request(app)
        .patch(`/v2/users/${user.id}/default-bank-account`)
        .send({
          bankAccountId: `${newBankAccount.id}`,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(200);

      response = await withInternalUser(req, agent);
    });

    it('responds with the updated user', () => {
      const {
        body: {
          data: { attributes },
        },
      } = response;

      expect(attributes.defaultBankAccountId).to.equal(newBankAccount.id);
    });

    it('saves the updated default bank account id to the user', async () => {
      await user.reload();

      expect(user.defaultBankAccountId).to.equal(newBankAccount.id);
    });

    it("updates the bank connection's primary bank account id", async () => {
      const newBankConnection = await newBankAccount.getBankConnection();

      expect(newBankConnection.primaryBankAccountId).to.equal(newBankAccount.id);
    });

    it("does not modify the old bank connection's primary bank account id", async () => {
      const oldBankConnection = await oldBankAccount.getBankConnection();

      expect(oldBankConnection.primaryBankAccountId).to.equal(oldBankAccount.id);
    });

    it('creates an action log and dashboard user modification', async () => {
      const actionLog = await DashboardActionLog.findOne({
        where: { dashboardActionReasonId: dashboardActionReason.id, internalUserId: agent.id },
        rejectOnEmpty: true,
      });

      const modification = await DashboardUserModification.findOne({
        where: {
          dashboardActionLogId: actionLog.id,
        },
        rejectOnEmpty: true,
      });

      expect(modification.modification.defaultBankAccountId).to.deep.equal({
        previousValue: oldBankAccount.id,
        currentValue: newBankAccount.id,
      });
    });

    it("doesn't broadcast the changes", () => {
      sinon.assert.notCalled(stubs.publishUserUpdatedEventStub);
      sinon.assert.notCalled(stubs.updateSynapsepayUserTaskStub);
      sinon.assert.notCalled(stubs.updateBrazeTaskStub);
    });
  });

  context('error states', () => {
    it('bank account does not exist', async () => {
      const nonExistentId = -1;

      const req = request(app)
        .patch(`/v2/users/${user.id}/default-bank-account`)
        .send({
          bankAccountId: `${nonExistentId}`,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(404);

      response = await withInternalUser(req, agent);

      const {
        body: { message },
      } = response;

      expect(message).to.include(`Cannot find bank account with id: ${nonExistentId}`);
    });

    it('bank account does not belong to user', async () => {
      const { id: otherUsersBankAccountId } = await factory.create<BankAccount>(
        'checking-account',
        {
          userId: -1,
        },
      );

      const req = request(app)
        .patch(`/v2/users/${user.id}/default-bank-account`)
        .send({
          bankAccountId: `${otherUsersBankAccountId}`,
          dashboardActionReasonId: dashboardActionReason.id,
        })
        .expect(404);

      response = await withInternalUser(req, agent);

      const {
        body: { message },
      } = response;

      expect(message).to.include(`Cannot find bank account with id: ${otherUsersBankAccountId}`);
    });
  });
});
