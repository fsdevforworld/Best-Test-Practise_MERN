import * as bulkAdminNotesDomain from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-admin-note';
import * as bulkClosuresDomain from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-account-closure';
import * as bulkFraudRulesDomain from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/process-bulk-fraud-block';
import * as fileHelpers from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/file-helpers';
import * as gcloudStorage from '../../../../../src/lib/gcloud-storage';
import * as Jobs from '../../../../../src/jobs/data';
import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { bulkUpdateConfig } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/helpers';
import {
  BulkUpdateProcessOutputRow,
  DashboardBulkUpdateExtra,
} from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/dashboard-bulk-update-typings';
import { clean, withInternalUser } from '../../../../test-helpers';
import { expect } from 'chai';

import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardBulkUpdate,
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
  const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

  const dashboardActionLog = await factory.create('dashboard-action-log', {
    internalUserId: internalUser.id,
    dashboardActionReasonId: dashboardActionReason.id,
    note: 'someNote',
  });

  const extraFieldJson: DashboardBulkUpdateExtra = {
    isHighPriorityAdminNote: false,
  };

  const dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
    inputFileUrl: mockInputFileUrl,
    outputFileUrl: mockOutputFileUrl,
    inputFileRowCount: 90210,
    dashboardActionLogId: dashboardActionLog.id,
    status: bulkUploadStatus,
    reason: dashboardActionReason.reason,
    extra: extraFieldJson,
  });
  return {
    dashboardBulkUpdate,
    dashboardAction,
    dashboardActionReason,
    internalUser,
    dashboardActionLog,
  };
}

describe('POST /v2/dashboard-bulk-updates/:id/process', () => {
  const sandbox = sinon.createSandbox();
  const mockInputFileUrl = 'someFakeInputUrl';
  const mockOutputFileUrl = 'someFakeOutputUrl';

  const role = 'bulkUpdateAdmin';

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('when trying to process a bulkUpdate that does not exist', async () => {
    it('returns a 404 error', async () => {
      const req = request(app)
        .post('/v2/dashboard-bulk-updates/98210/process')
        .expect(404);

      await withInternalUser(req, { roleAttrs: { name: role } });
    });
  });

  describe('when trying to process a bulkUpdate that has already been processed', async () => {
    it('returns a 200 and the existing bulkUpdate object', async () => {
      const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
        mockInputFileUrl,
        mockOutputFileUrl,
        'COMPLETED',
        ActionCode.BulkUpdateFraudBlock,
      );

      const req = request(app)
        .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
        .expect(200);

      const res = await withInternalUser(req, { roleAttrs: { name: role } });
      expect(res.text).to.contain(bulkUpdateConfig.gCloudAuthURLBase);
    });
  });

  describe('when trying to process a bulkUpdate ', async () => {
    describe('and it fails to download the inputFile ', async () => {
      it('returns a 500 and the correct message', async () => {
        sandbox.restore();
        sandbox.stub(gcloudStorage, 'getGCSFile').throws(new Error('someError'));
        const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
          mockInputFileUrl,
          mockOutputFileUrl,
          'PENDING',
          ActionCode.BulkUpdateFraudBlock,
        );

        const req = request(app)
          .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
          .expect(500);

        const res = await withInternalUser(req, { roleAttrs: { name: role } });
        expect(res.text).to.contain('Failed downloading input file');
      });
    });

    describe('and it fails processing the input file', async () => {
      it('returns a 500 and the correct message', async () => {
        const errorMessage = 'someError';
        sandbox.stub(fileHelpers, 'downloadBulkUpdateCsvAsArray').returns([90210]);
        sandbox.stub(bulkFraudRulesDomain, 'processBulkFraudBlock').throws(new Error(errorMessage));

        const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
          mockInputFileUrl,
          mockOutputFileUrl,
          'PENDING',
          ActionCode.BulkUpdateFraudBlock,
        );

        const req = request(app)
          .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
          .expect(200);

        const res = await withInternalUser(req, { roleAttrs: { name: role } });
        expect(res.text).to.contain('FAILED');
      });
    });

    describe('and it is able to process the input file', async () => {
      describe('for a bulk fraud block', async () => {
        it('it returns 200 and the output file contains the expected number of rows', async () => {
          sandbox.restore();

          const mockOutputRows: BulkUpdateProcessOutputRow[] = [
            {
              daveUserId: '1',
              originalDaveUserIdList: '1',
              dateTimeActionTaken: 'someTime',
              primaryAction: 'someAction',
              reason: 'someReason',
              outstandingBalanceBeforeAction: 0,
              currentOutstandingBalance: 0,
              daveDashAdminNote: 'someNote',
              cstAdminNote: 'someNote',
              error: 'someError',
              secondaryAction: 'someAction',
            },
          ];

          sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);
          sandbox.stub(fileHelpers, 'downloadBulkUpdateCsvAsArray').returns([90210]);
          sandbox.stub(bulkFraudRulesDomain, 'processBulkFraudBlock').returns(mockOutputRows);
          const spy = sandbox.stub(fileHelpers, 'generateCsvFileBufferFromObjectArray');

          const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
            mockInputFileUrl,
            mockOutputFileUrl,
            'PENDING',
            ActionCode.BulkUpdateFraudBlock,
          );

          const req = request(app)
            .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
            .expect(200);

          await withInternalUser(req, { roleAttrs: { name: role } });

          expect(spy.getCall(0).args[0].length).to.equal(1);
        });
      });

      describe('for a bulk account closure', async () => {
        it('it returns 200 and the output file contains the expected number of rows', async () => {
          sandbox.restore();

          const mockOutputRows: BulkUpdateProcessOutputRow[] = [
            {
              daveUserId: '1',
              originalDaveUserIdList: '1',
              dateTimeActionTaken: 'someTime',
              primaryAction: 'someAction',
              reason: 'someReason',
              outstandingBalanceBeforeAction: 0,
              currentOutstandingBalance: 0,
              daveDashAdminNote: 'someNote',
              cstAdminNote: 'someNote',
              error: 'someError',
              secondaryAction: 'someAction',
            },
          ];

          sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);
          sandbox.stub(fileHelpers, 'downloadBulkUpdateCsvAsArray').returns([90210]);
          sandbox.stub(bulkClosuresDomain, 'processBulkAccountClosure').returns(mockOutputRows);
          const spy = sandbox.stub(fileHelpers, 'generateCsvFileBufferFromObjectArray');

          const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
            mockInputFileUrl,
            mockOutputFileUrl,
            'PENDING',
            ActionCode.BulkUpdateAccountClosure,
          );

          const req = request(app)
            .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
            .expect(200);

          await withInternalUser(req, { roleAttrs: { name: role } });

          expect(spy.getCall(0).args[0].length).to.equal(1);
        });
      });

      describe('for a bulk account closure', async () => {
        it('it returns 200 and the output file contains the expected number of rows', async () => {
          sandbox.restore();

          const mockOutputRows: BulkUpdateProcessOutputRow[] = [
            {
              daveUserId: '1',
              originalDaveUserIdList: '1',
              dateTimeActionTaken: 'someTime',
              primaryAction: 'someAction',
              reason: 'someReason',
              outstandingBalanceBeforeAction: 0,
              currentOutstandingBalance: 0,
              daveDashAdminNote: 'someNote',
              cstAdminNote: 'someNote',
              error: 'someError',
              secondaryAction: 'someAction',
            },
          ];

          sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);
          sandbox.stub(fileHelpers, 'downloadBulkUpdateCsvAsArray').returns([90210]);
          sandbox.stub(bulkAdminNotesDomain, 'processBulkAdminNote').returns(mockOutputRows);
          const spy = sandbox.stub(fileHelpers, 'generateCsvFileBufferFromObjectArray');

          const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
            mockInputFileUrl,
            mockOutputFileUrl,
            'PENDING',
            ActionCode.BulkUpdateAdminNote,
          );

          const req = request(app)
            .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
            .expect(200);

          await withInternalUser(req, { roleAttrs: { name: role } });

          expect(spy.getCall(0).args[0].length).to.equal(1);
        });
      });

      describe('for a non-existing bulk update type', async () => {
        it('it returns 200 and the output file contains the no rows', async () => {
          sandbox.restore();

          sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);
          sandbox.stub(fileHelpers, 'downloadBulkUpdateCsvAsArray').returns([90210]);
          const spy = sandbox.stub(fileHelpers, 'generateCsvFileBufferFromObjectArray');

          const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
            mockInputFileUrl,
            mockOutputFileUrl,
            'PENDING',
            'NonExistingBulkUpdateType',
          );

          const req = request(app)
            .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process`)
            .expect(200);

          await withInternalUser(req, { roleAttrs: { name: role } });

          expect(spy.getCall(0).args[0].length).to.equal(0);
        });
      });
    });
  });
});

describe('POST /v2/dashboard-bulk-updates/:id/process/async', () => {
  const sandbox = sinon.createSandbox();
  const mockInputFileUrl = 'someFakeInputUrl';
  const mockOutputFileUrl = 'someFakeOutputUrl';

  const role = 'bulkUpdateAdmin';

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  describe('when calling the async api', async () => {
    it('should return 200 with valid inputs', async () => {
      sandbox.restore();

      const spy = sandbox.stub(Jobs, 'createProcessDashboardBulkUpdateTask');

      const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
        mockInputFileUrl,
        mockOutputFileUrl,
        'PENDING',
        ActionCode.BulkUpdateFraudBlock,
      );

      const req = request(app)
        .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process/async`)
        .expect(200);

      await withInternalUser(req, { roleAttrs: { name: role } });

      expect(spy.getCall(0).args[0].dashboardBulkUpdateId).to.equal(dashboardBulkUpdate.id);
    });

    it('should return a 200 for existing bulkUpdate object', async () => {
      const { dashboardBulkUpdate } = await createBulkUpdateWithSupportingObjects(
        mockInputFileUrl,
        mockOutputFileUrl,
        'COMPLETED',
        ActionCode.BulkUpdateFraudBlock,
      );

      const req = request(app)
        .post(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/process/async`)
        .expect(200);

      const res = await withInternalUser(req, { roleAttrs: { name: role } });
      expect(res.text).to.contain(bulkUpdateConfig.gCloudAuthURLBase);
    });
  });
});
