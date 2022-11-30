import * as gcloudStorage from '../../../../../src/lib/gcloud-storage';
import * as request from 'supertest';
import * as sinon from 'sinon';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { clean, withInternalUser } from '../../../../test-helpers';
import { DashboardActionLog, DashboardBulkUpdate } from '../../../../../src/models';
import { DashboardBulkUpdateExtra } from '../../../../../src/services/internal-dashboard-api/domain/dashboard-bulk-update/dashboard-bulk-update-typings';
import { expect } from 'chai';

import {
  MISSING_CSV,
  FAILED_INSERTING_ROW_INTO_TABLE,
  CSV_FAILED_VALIDATION,
  UNABLE_TO_UPLOAD_FILE,
  MAXIMUM_ROW_COUNT_EXCEEDED,
  INVALID_DASHBOARD_ACTION_REASON,
  INVALID_EXTRA_FIELD,
} from '../../../../../src/services/internal-dashboard-api/v2/dashboard-bulk-updates/create';

describe('POST /v2/dashboard-bulk-updates', () => {
  const sandbox = sinon.createSandbox();
  const testCsvDirectory =
    'test/services/internal-dashboard-api/v2/dashboard-bulk-updates/test-csvs';
  const mockInputFileUrl = 'http//you.should.not.com/use-http/always-use-https.csv';
  const role = 'bulkUpdateAdmin';

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  it('successfully creates a a bulk update item', async () => {
    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateAdminNote,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const extraFieldJson: DashboardBulkUpdateExtra = {
      isHighPriorityAdminNote: false,
    };

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .field('extra', JSON.stringify(extraFieldJson))
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: role } });
    const bulkUpdatesInDB = await DashboardBulkUpdate.findAll();

    expect(bulkUpdatesInDB).to.not.be.undefined;
    expect(bulkUpdatesInDB).to.have.length(1);
    expect(bulkUpdatesInDB[0].inputFileUrl).to.equal(mockInputFileUrl);
    expect(bulkUpdatesInDB[0].name).to.equal('test-csv1.csv.tst');
    expect(bulkUpdatesInDB[0].extra.isHighPriorityAdminNote).to.equal(
      extraFieldJson.isHighPriorityAdminNote,
    );
  });

  it('errors when the extra field is not a valid JSON', async () => {
    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateAdminNote,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .field('extra', 'NOT A VALID JSON')
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });

    expect(res.text).to.contain(INVALID_EXTRA_FIELD);
  });

  it('errors if the csv file is missing from the request', async () => {
    await factory.create('dashboard-action');
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(MISSING_CSV);
  });

  it('errors if the note is missing and it is required', async () => {
    await factory.create('dashboard-action');
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain('invalid_parameters');
  });

  it('does not error if the note is missing and it is not required', async () => {
    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    await factory.create('dashboard-action');
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: false,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: role } });
    const bulkUpdatesInDB = await DashboardBulkUpdate.findAll();

    expect(bulkUpdatesInDB).to.not.be.undefined;
    expect(bulkUpdatesInDB).to.have.length(1);
    expect(bulkUpdatesInDB[0].inputFileUrl).to.equal(mockInputFileUrl);
    expect(bulkUpdatesInDB[0].name).to.equal('test-csv1.csv.tst');
  });

  it('errors if the actionReasonId is missing', async () => {
    await factory.create('dashboard-action');

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain('invalid_parameters');
  });

  it('errors if the given actionReasonId is invalid', async () => {
    await factory.create('dashboard-action');

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', 99)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(INVALID_DASHBOARD_ACTION_REASON);
  });

  it('returns 500 when fails to save to GCP', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').returns(undefined);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(500);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    const bulkUpdatesInDB = await DashboardBulkUpdate.findAll();

    expect(bulkUpdatesInDB.length).to.equal(0);
    expect(res.text).to.contain(UNABLE_TO_UPLOAD_FILE);
  });

  it('errors when it cannot connect to the DB', async () => {
    await sandbox.restore();

    const error = 'testing failed db connection';
    sandbox.stub(DashboardActionLog, 'create').throws(error);
    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });
    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv1.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(500);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });

    expect(res.text).to.contain(FAILED_INSERTING_ROW_INTO_TABLE);
  });

  it('errors when the given CSV has more than the desired number of columns', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });
    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/test-csv2-too-many-columns.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(CSV_FAILED_VALIDATION);
  });

  it('errors when the given CSV has too many records', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/more-than-500-rows.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(MAXIMUM_ROW_COUNT_EXCEEDED);
  });

  it('errors when the given file is not a CSV', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/not-a-csv.txt')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(CSV_FAILED_VALIDATION);
  });

  it('errors when the given CSV file has records that are too long', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/user-id-too-long.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(CSV_FAILED_VALIDATION);
  });

  it('errors when the given CSV file has a column name', async () => {
    await sandbox.restore();

    sandbox.stub(gcloudStorage, 'uploadFileBufferToGCloud').resolves(mockInputFileUrl);

    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });

    const req = request(app)
      .post('/v2/dashboard-bulk-updates')
      .attach('file', testCsvDirectory + '/with-column-name.csv.tst')
      .field('note', 'this is a test note')
      .field('dashboardActionReasonId', dashboardActionReason.id)
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: role } });
    expect(res.text).to.contain(CSV_FAILED_VALIDATION);
  });
});
