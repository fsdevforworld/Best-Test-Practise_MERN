import * as sinon from 'sinon';
import * as SynapsepayModels from '../../../../../src/domain/synapsepay/external-model-definitions';
import AccountManagement from '../../../../../src/domain/account-management';
import braze from '../../../../../src/lib/braze';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { BulkUpdateProcessInput } from './dashboard-bulk-update-typings';
import { clean } from '../../../../test-helpers';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { processBulkAccountClosure } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-account-closure';
import {
  USER_ALREADY_DELETED,
  USER_DOES_NOT_EXIST,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/error-messages';

describe('Dashboard Bulk Update Account Closure', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean(sandbox));

  beforeEach(async () => {
    sandbox.stub(SynapsepayModels.users, 'getAsync').resolves({ updateAsync: (params: any) => {} });
  });

  afterEach(() => clean(sandbox));

  describe('When we try to close a list of input users', async () => {
    describe('And the list is an empty list', async () => {
      it('returns an empty list of output rows', async () => {
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [],
          dashboardBulkUpdateId: 0,
          internalUserId: -1,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: 1,
        };

        const result = await processBulkAccountClosure(mockInput);
        expect(result.length).to.equal(0);
      });
    });

    describe('And the list is an a user that does not exists', async () => {
      it('returns an a list with the expected error', async () => {
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [90210],
          dashboardBulkUpdateId: 0,
          internalUserId: -1,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: 1,
        };
        const result = await processBulkAccountClosure(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].error).to.contain(USER_DOES_NOT_EXIST);
      });
    });

    describe('And the list contains only users whose accounts have already been deleted', async () => {
      it('returns list of output rows all with errors', async () => {
        const user = await factory.create('user', {
          email: 'test@dave.com',
          deleted: moment(),
        });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user.id],
          dashboardBulkUpdateId: 0,
          internalUserId: -1,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: 1,
        };
        const result = await processBulkAccountClosure(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].error).to.contain(USER_ALREADY_DELETED);
      });
    });

    describe('And the list contains only one user whose account is active with no balance', async () => {
      it('returns a list of length 1 with that user', async () => {
        const user = await factory.create('user', { email: 'test@dave.com' });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user.id],
          dashboardBulkUpdateId: 0,
          internalUserId: -1,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: 1,
        };
        const result = await processBulkAccountClosure(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].daveUserId).to.equal(user.id.toString());
        expect(result[0].outstandingBalanceBeforeAction).to.equal(0);
      });
    });

    describe('And the list contains only one user whose account is active with a current balance', async () => {
      it('returns a list of length 1 with that user and their old balance is given', async () => {
        const oldBalance = 75;

        const user = await factory.create('user', { email: 'test@dave.com' });
        await factory.create('advance', { userId: user.id, amount: oldBalance });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user.id],
          dashboardBulkUpdateId: 0,
          internalUserId: -1,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: 1,
        };

        const result = await processBulkAccountClosure(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].daveUserId).to.equal(user.id.toString());
        expect(result[0].outstandingBalanceBeforeAction).to.equal(oldBalance);
      });
    });

    describe('And the list contains multiple users, some already deleted, some with no balance and some with balance', async () => {
      it('returns a list of with expected outputs for each user', async () => {
        const user = await factory.create('user', { email: 'test@dave.com' });
        const user2 = await factory.create('user', { email: 'test2@dave.com' });
        const user3 = await factory.create('user', {
          email: 'test3@dave.com',
          deleted: moment(),
        });
        const oldBalance = 75;
        await factory.create('advance', { userId: user.id, amount: oldBalance });
        const internalUser = await factory.create('internal-user');
        const dashboardAction = await factory.create('dashboard-action', {
          code: ActionCode.BulkUpdateAccountClosure,
        });
        const dashboardActionReason = await factory.create('dashboard-action-reason', {
          dashboardActionId: dashboardAction.id,
        });
        const dashboardActionLog = await factory.create('dashboard-action-log', {
          dashboardActionReasonId: dashboardActionReason.id,
          internalUserId: internalUser.id,
        });

        sandbox.stub(braze, 'deleteUsers').resolves();

        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user.id, user2.id, user3.id],
          dashboardBulkUpdateId: 0,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          dashboardActionLogId: dashboardActionLog.id,
        };

        const result = await processBulkAccountClosure(mockInput);
        expect(result.length).to.equal(3);
        expect(result[0].daveUserId).to.equal(user.id.toString());
        expect(result[0].outstandingBalanceBeforeAction).to.equal(oldBalance);
        expect(result[0].error).to.be.undefined;
        expect(result[1].daveUserId).to.equal(user2.id.toString());
        expect(result[1].outstandingBalanceBeforeAction).to.equal(0);
        expect(result[1].error).to.be.undefined;
        expect(result[2].daveUserId).to.equal(user3.id.toString());
        expect(result[2].outstandingBalanceBeforeAction).to.equal(0);
        expect(result[2].error).to.contain(USER_ALREADY_DELETED);
      });

      describe('And we fail to delete one of the users', async () => {
        it('returns a list of with expected outputs for each user', async () => {
          const errorMessage = 'Baby Shark doo doo, doo doo doo doo';
          sandbox.stub(AccountManagement, 'removeUserAccountById').throws(new Error(errorMessage));
          const user = await factory.create('user', { email: 'test@dave.com' });
          const internalUser = await factory.create('internal-user');
          const dashboardAction = await factory.create('dashboard-action', {
            code: ActionCode.BulkUpdateAccountClosure,
          });
          const dashboardActionReason = await factory.create('dashboard-action-reason', {
            dashboardActionId: dashboardAction.id,
          });
          const dashboardActionLog = await factory.create('dashboard-action-log', {
            dashboardActionReasonId: dashboardActionReason.id,
            internalUserId: internalUser.id,
          });

          const mockInput: BulkUpdateProcessInput = {
            inputUsers: [user.id],
            dashboardBulkUpdateId: 0,
            internalUserId: internalUser.id,
            primaryAction: 'someAction',
            actionLogNote: 'someNote',
            reason: 'someReason',
            dashboardActionLogId: dashboardActionLog.id,
          };
          const result = await processBulkAccountClosure(mockInput);

          expect(result.length).to.equal(1);
          expect(result[0].daveUserId).to.equal(user.id.toString());
          expect(result[0].outstandingBalanceBeforeAction).to.equal(0);
          expect(result[0].currentOutstandingBalance).to.equal(0);
          expect(result[0].error).to.contain(errorMessage);
        });
      });
    });
  });
});
