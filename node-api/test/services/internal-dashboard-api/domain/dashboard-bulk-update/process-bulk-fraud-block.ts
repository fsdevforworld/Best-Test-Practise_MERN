import * as fraudRule from '../../../../../src/helper/fraud-rule';
import * as helpers from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/helpers';
import * as sinon from 'sinon';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { assert, expect } from 'chai';
import { BulkUpdateProcessInput } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/dashboard-bulk-update-typings';
import { clean } from '../../../../test-helpers';
import { processBulkFraudBlock } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-fraud-block';
import {
  ALREADY_FRAUD_BLOCKED,
  USER_DOES_NOT_EXIST,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/error-messages';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardBulkUpdate,
  DashboardBulkUpdateFraudRule,
  InternalUser,
} from '../../../../../src/models';

export async function createBulkUpdateWithSupportingObjects(
  mockInputFileUrl: string,
  mockOutputFileUrl: string,
  bulkUploadStatus: string,
  bulkUploadType: string,
): Promise<{
  dashboardBulkUpdate: DashboardBulkUpdate;
  dashboardAction: DashboardAction;
  dashboardActionReason: DashboardActionReason;
  internalUser: InternalUser;
  dashboardActionLog: DashboardActionLog;
}> {
  const dashboardAction: DashboardAction = await factory.create('dashboard-action', {
    code: bulkUploadType,
  });
  const dashboardActionReason: DashboardActionReason = await factory.create(
    'dashboard-action-reason',
    {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    },
  );
  const internalUser = await factory.create('internal-user', { email: 'test111111@dave.com' });

  const dashboardActionLog = await factory.create('dashboard-action-log', {
    internalUserId: internalUser.id,
    dashboardActionReasonId: dashboardActionReason.id,
    note: 'someNote',
  });

  const dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
    inputFileUrl: mockInputFileUrl,
    outputFileUrl: mockOutputFileUrl,
    inputFileRowCount: 90210,
    dashboardActionLogId: dashboardActionLog.id,
    status: bulkUploadStatus,
    reason: dashboardActionReason.reason,
  });
  return {
    dashboardBulkUpdate,
    dashboardAction,
    dashboardActionReason,
    internalUser,
    dashboardActionLog,
  };
}

describe('Dashboard Bulk Update Fraud Block', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('and given userId does not exist', async () => {
    it('it returns the expected error message', async () => {
      const mockInput: BulkUpdateProcessInput = {
        inputUsers: [90210],
        dashboardBulkUpdateId: -1,
        internalUserId: -1,
        primaryAction: 'someAction',
        actionLogNote: 'someNote',
        reason: 'someReason',
      };
      const result = await processBulkFraudBlock(mockInput);

      expect(result[0].error).to.contain(USER_DOES_NOT_EXIST);

      // Check the DB
      const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
      expect(foundAssociations.length).to.equal(0);
    });
  });

  describe('and given userId is already fraud blocked', async () => {
    it('it returns the expected error message', async () => {
      const user = await factory.create('user', { email: 'test@dave.com', fraud: true });

      const mockInput: BulkUpdateProcessInput = {
        inputUsers: [user.id],
        dashboardBulkUpdateId: -1,
        internalUserId: -1,
        primaryAction: 'someAction',
        actionLogNote: 'someNote',
        reason: 'someReason',
      };
      const result = await processBulkFraudBlock(mockInput);

      expect(result[0].error).to.contain(ALREADY_FRAUD_BLOCKED);

      // Check the DB
      const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
      expect(foundAssociations.length).to.equal(0);
    });
  });

  describe('the given userId generated no rules', async () => {
    it('it returns one row with that specific originalDaveUserId', async () => {
      const internalUser = await factory.create('internal-user', {
        email: 'internalTest@dave.com',
      });
      const generateRulesStub = sandbox
        .stub(helpers, 'createBulkUpdateFraudRulesForUser')
        .returns([]);
      const checkExistingRuleSpy = sandbox.spy(fraudRule, 'fraudRuleExists');

      const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
        'mockInputFileUrl',
        'mockOutputFileUrl',
        'PENDING',
        ActionCode.BulkUpdateFraudBlock,
      );
      const user1 = await factory.create('user', {
        email: 'test@dave.com',
        addressLine1: '1 Main',
        city: 'here',
        state: 'CA',
        zipCode: '90210',
      });

      const mockInput: BulkUpdateProcessInput = {
        inputUsers: [user1.id],
        dashboardBulkUpdateId: dashboardBulkUpdate.id,
        internalUserId: internalUser.id,
        primaryAction: 'someAction',
        actionLogNote: 'someNote',
        reason: 'someReason',
      };
      const result = await processBulkFraudBlock(mockInput);

      // Should call rules generation once per user
      expect(generateRulesStub.getCalls().length).to.equal(1);

      // No rules generated, so no rules to check
      expect(checkExistingRuleSpy.getCalls().length).to.equal(0);

      expect(result[0].daveUserId).to.equal(`${user1.id}`);
      expect(result[0].originalDaveUserIdList).to.equal(`${user1.id}`);
      expect(result[0].error).to.be.undefined;

      // Check the DB
      const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
      expect(foundAssociations.length).to.equal(0);
    });
  });

  describe('and it succeeds while creating rules', async () => {
    describe('for two users that generate one rule that is the same', async () => {
      it('that duplicate rule is deduped, but both users still affected by each other', async () => {
        const internalUser = await factory.create('internal-user', {
          email: 'internalTest@dave.com',
        });
        const generateRulesSpy = sandbox.spy(helpers, 'createBulkUpdateFraudRulesForUser');

        const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
          'mockInputFileUrl',
          'mockOutputFileUrl',
          'PENDING',
          ActionCode.BulkUpdateFraudBlock,
        );
        const user1 = await factory.create('user', {
          email: 'test@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const user2 = await factory.create('user', {
          email: 'test1@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user1.id, user2.id],
          dashboardBulkUpdateId: dashboardBulkUpdate.id,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };
        const result = await processBulkFraudBlock(mockInput);

        // Should call rules generation once per user
        expect(generateRulesSpy.getCalls().length).to.equal(2);

        // Each of the calls should return 3 rules
        expect(generateRulesSpy.getCall(0).returnValue.length).to.equal(3);
        expect(generateRulesSpy.getCall(1).returnValue.length).to.equal(3);

        // Expect that each user affected the other
        expect(result[0].daveUserId).to.equal(`${user1.id}`);
        expect(result[0].originalDaveUserIdList).to.equal(`${user1.id},${user2.id}`);
        expect(result[1].daveUserId).to.equal(`${user2.id}`);
        expect(result[1].originalDaveUserIdList).to.equal(`${user1.id},${user2.id}`);

        // Check the DB
        const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
        expect(foundAssociations.length).to.equal(5);
      });
    });

    describe('for one user, but it generates rules that affects another existing user', async () => {
      it('it returns both users being fraud blocked but only affected by one', async () => {
        const internalUser = await factory.create('internal-user', {
          email: 'internalTest@dave.com',
        });
        const generateRulesSpy = sandbox.spy(helpers, 'createBulkUpdateFraudRulesForUser');

        const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
          'mockInputFileUrl',
          'mockOutputFileUrl',
          'PENDING',
          ActionCode.BulkUpdateFraudBlock,
        );
        const user1 = await factory.create('user', {
          email: 'test@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const user2 = await factory.create('user', {
          email: 'test1@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user1.id],
          dashboardBulkUpdateId: dashboardBulkUpdate.id,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };
        const result = await processBulkFraudBlock(mockInput);

        // Should call rules generation once per given user
        expect(generateRulesSpy.getCalls().length).to.equal(1);

        // Each of the calls should return 3 rules
        expect(generateRulesSpy.getCall(0).returnValue.length).to.equal(3);

        // Expect that each user affected the other
        expect(result[0].daveUserId).to.equal(`${user1.id}`);
        expect(result[0].originalDaveUserIdList).to.equal(`${user1.id}`);
        expect(result[1].daveUserId).to.equal(`${user2.id}`);
        expect(result[1].originalDaveUserIdList).to.equal(`${user1.id}`);

        // Check the DB
        const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
        expect(foundAssociations.length).to.equal(3);
      });
    });

    describe('but it fails when generating fraud alerts', async () => {
      it('rolls back the transaction and no changes were made in the DB', async () => {
        const internalUser = await factory.create('internal-user', {
          email: 'internalTest@dave.com',
        });

        const errorMessage = 'someError';
        sandbox.stub(helpers, 'createBulkUpdateFraudRulesForUser').throws(new Error(errorMessage));

        const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
          'mockInputFileUrl',
          'mockOutputFileUrl',
          'PENDING',
          ActionCode.BulkUpdateFraudBlock,
        );
        const user1 = await factory.create('user', {
          email: 'test@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const user2 = await factory.create('user', {
          email: 'test1@dave.com',
          addressLine1: '1 Main',
          city: 'here',
          state: 'CA',
          zipCode: '90210',
        });
        const mockInput: BulkUpdateProcessInput = {
          inputUsers: [user1.id, user2.id],
          dashboardBulkUpdateId: dashboardBulkUpdate.id,
          internalUserId: internalUser.id,
          primaryAction: 'someAction',
          actionLogNote: 'someNote',
          reason: 'someReason',
        };
        try {
          await processBulkFraudBlock(mockInput);
          assert.fail({ message: 'Expected test to fail' });
        } catch (error) {
          // Should return the error
          expect(error.message).to.contain(errorMessage);
        }

        // Check the DB
        const foundAssociations = await DashboardBulkUpdateFraudRule.findAll();
        expect(foundAssociations.length).to.equal(0);
      });
    });
  });
});
