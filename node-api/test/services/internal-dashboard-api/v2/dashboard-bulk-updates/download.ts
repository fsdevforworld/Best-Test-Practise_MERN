import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { expect } from 'chai';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { DashboardActionLog, DashboardBulkUpdate } from '../../../../../src/models';
import { PassThrough } from 'stream';
import * as sinon from 'sinon';
import * as gcloudHelpers from '../../../../../src/lib/gcloud-storage';

describe('GET /v2/dashboard-bulk-updates/:id/download', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  let req: request.Test;
  let dashboardBulkUpdate: DashboardBulkUpdate;
  let dashboardActionLog: DashboardActionLog;

  beforeEach(async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });
    const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

    dashboardActionLog = await factory.create('dashboard-action-log', {
      internalUserId: internalUser.id,
      dashboardActionReasonId: dashboardActionReason.id,
      note: 'someNote',
    });

    dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
      dashboardActionLogId: dashboardActionLog.id,
      status: 'COMPLETED',
      name: 'valid.csv',
    });

    req = request(app)
      .get(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/download`)
      .expect(200);
  });

  it('sends the csv', async () => {
    const mockedStream = new PassThrough();

    sandbox.stub(gcloudHelpers, 'getGCSFileStream').returns(mockedStream);

    mockedStream.emit('data', 'hello world');
    mockedStream.end();

    const { header } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(header['content-type']).to.contain('text/csv');
    expect(header['access-control-expose-headers']).to.equal('Content-Disposition');
    expect(header['content-disposition']).to.equal(
      `attachment; filename="${dashboardBulkUpdate.name}"`,
    );
  });

  it('throws error when attempting to download bulk update that has not been processed', async () => {
    dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
      dashboardActionLogId: dashboardActionLog.id,
      name: 'valid.csv',
    });

    req = req = request(app)
      .get(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}/download`)
      .expect(400);

    await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });
  });
});
