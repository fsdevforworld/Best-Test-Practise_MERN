import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import { clean, withInternalUser } from '../../../../test-helpers';
import factory from '../../../../factories';
import { expect } from 'chai';
import { ActionCode } from '../../../../../src/services/internal-dashboard-api/domain/action-log';
import { DashboardBulkUpdate } from '../../../../../src/models';

describe('GET /v2/dashboard-bulk-updates/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  let req: request.Test;
  let dashboardBulkUpdate: DashboardBulkUpdate;

  beforeEach(async () => {
    const dashboardAction = await factory.create('dashboard-action', {
      code: ActionCode.BulkUpdateFraudBlock,
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      noteRequired: true,
      dashboardActionId: dashboardAction.id,
    });
    const internalUser = await factory.create('internal-user', { email: 'test@dave.com' });

    const dashboardActionLog = await factory.create('dashboard-action-log', {
      internalUserId: internalUser.id,
      dashboardActionReasonId: dashboardActionReason.id,
      note: 'someNote',
    });

    dashboardBulkUpdate = await factory.create('dashboard-bulk-update', {
      dashboardActionLogId: dashboardActionLog.id,
    });

    req = request(app)
      .get(`/v2/dashboard-bulk-updates/${dashboardBulkUpdate.id}`)
      .expect(200);
  });

  it('returns serialized dashboard bulk update', async () => {
    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(data.type).to.equal('dashboard-bulk-update');
    expect(data.id).to.equal(`${dashboardBulkUpdate.id}`);
  });
});
