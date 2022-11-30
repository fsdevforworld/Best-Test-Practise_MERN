import * as sinon from 'sinon';
import AdminComment from '../../../../../src/models/admin-comment';
import factory from '../../../../factories';
import { assert, expect } from 'chai';
import { clean } from '../../../../test-helpers';
import { processBulkAdminNote } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-admin-note';
import { USER_DOES_NOT_EXIST } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/error-messages';
import {
  BulkUpdateProcessInput,
  DashboardBulkUpdateExtra,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/dashboard-bulk-update-typings';

describe('Dashboard Bulk Update Admin Note', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('When we try to add a bulk admin note a list of input users', async () => {
    describe('And the list contains only one user whose account is active with a current balance', async () => {
      it('returns a list of length 1 with that user and their correct balance is given', async () => {
        const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

        const oldBalance = 75;

        const extraField: DashboardBulkUpdateExtra = {
          isHighPriorityAdminNote: true,
        };
        const user = await factory.create('user', { email: 'test@dave.com' });
        await factory.create('advance', { userId: user.id, amount: oldBalance });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user.id],
          dashboardBulkUpdateId: 0,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
          extra: extraField,
        };

        const result = await processBulkAdminNote(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].daveUserId).to.equal(user.id.toString());
        expect(result[0].currentOutstandingBalance).to.equal(oldBalance);

        const adminNotesInDB = await AdminComment.findAll();

        expect(adminNotesInDB).to.not.be.undefined;
        expect(adminNotesInDB).to.have.length(1);
        expect(adminNotesInDB[0].isHighPriority).to.equal(extraField.isHighPriorityAdminNote);
      });
    });

    describe('And the list contains only one user that does not exist', async () => {
      it('returns a list of length 1 with the expected error', async () => {
        const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });
        const fakeUserId = 90210;
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [fakeUserId],
          dashboardBulkUpdateId: 0,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };

        const result = await processBulkAdminNote(mockInput);

        expect(result.length).to.equal(1);
        expect(result[0].daveUserId).to.equal(fakeUserId.toString());
        expect(result[0].error).to.equal(USER_DOES_NOT_EXIST);
      });
    });

    describe('And the list contains no users', async () => {
      it('returns a list of length 0', async () => {
        const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [],
          dashboardBulkUpdateId: 0,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };

        const result = await processBulkAdminNote(mockInput);

        expect(result.length).to.equal(0);
      });
    });

    describe('And the list contains one user', async () => {
      describe('And it fails creating the admin note', async () => {
        it('throws the error', async () => {
          const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });
          const user = await factory.create('user', { email: 'test@dave.com' });

          const errorMessage = 'SomeError';
          sandbox.stub(AdminComment, 'create').throws(new Error(errorMessage));

          const mockInput: BulkUpdateProcessInput = {
            inputUsers: [user.id],
            dashboardBulkUpdateId: 0,
            internalUserId: internalUser.id,
            primaryAction: 'someAction',
            actionLogNote: 'someNote',
            reason: 'someReason',
          };

          try {
            await processBulkAdminNote(mockInput);
            assert.fail({ message: 'Expected test to fail' });
          } catch (error) {
            expect(error.message).to.contain(errorMessage);
          }
        });
      });
    });

    describe('And the list several users, some exist, some deleted, some do not exist', async () => {
      it('returns a a list with an item for each user with the expected values / errors', async () => {
        const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

        const user1 = await factory.create('user', { email: 'test1@dave.com' });
        const user2 = await factory.create('user', { email: 'test2@dave.com' });
        const fakeUserId1 = 90210;
        const fakeUserId2 = 90211;

        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user1.id, user2.id, fakeUserId1, fakeUserId2],
          dashboardBulkUpdateId: 0,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };

        const result = await processBulkAdminNote(mockInput);

        expect(result.length).to.equal(4);
        expect(result[0].daveUserId).to.equal(user1.id.toString());
        expect(result[0].error).to.be.undefined;
        expect(result[1].daveUserId).to.equal(user2.id.toString());
        expect(result[1].error).to.be.undefined;
        expect(result[2].daveUserId).to.equal(fakeUserId1.toString());
        expect(result[2].error).to.contain(USER_DOES_NOT_EXIST);
        expect(result[3].daveUserId).to.equal(fakeUserId2.toString());
        expect(result[3].error).to.contain(USER_DOES_NOT_EXIST);
      });
    });
  });
});
