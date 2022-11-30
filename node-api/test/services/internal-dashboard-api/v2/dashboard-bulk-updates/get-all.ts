import { expect } from 'chai';
import * as request from 'supertest';
import {
  DashboardAction,
  DashboardActionLog,
  DashboardActionReason,
  DashboardBulkUpdate,
  InternalUser,
} from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';

import { moment } from '@dave-inc/time-lib';
import { clean, withInternalUser } from '../../../../test-helpers';

describe('GET /v2/dashboard-bulk-updates', () => {
  before(() => clean());

  afterEach(() => clean());

  it('returns all dashboard bulk updates', async () => {
    const dashboardActionLog1 = await factory.create<DashboardActionLog>('dashboard-action-log');
    const dashboardActionLog2 = await factory.create<DashboardActionLog>('dashboard-action-log');
    const dashboardActionLog3 = await factory.create<DashboardActionLog>('dashboard-action-log');

    await Promise.all([
      factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
        dashboardActionLogId: dashboardActionLog1.id,
      }),
      factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
        dashboardActionLogId: dashboardActionLog2.id,
      }),
      factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
        dashboardActionLogId: dashboardActionLog3.id,
      }),
    ]);

    const req = request(app)
      .get(`/v2/dashboard-bulk-updates`)
      .expect(200);

    const {
      body: { data: bulkUpdates },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(bulkUpdates.length).to.eq(3);
  });

  it('returns serialized data', async () => {
    const internalUser = await factory.create<InternalUser>('internal-user');
    const dashboardAction = await factory.create<DashboardAction>('dashboard-action', {
      name: 'Fraud block',
    });
    const dashboardActionReason = await factory.create<DashboardActionReason>(
      'dashboard-action-reason',
      { dashboardActionId: dashboardAction.id },
    );
    const dashboardActionLog = await factory.create<DashboardActionLog>('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
    });
    const dashboardBulkUpdate = await factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
      dashboardActionLogId: dashboardActionLog.id,
    });

    const req = request(app)
      .get(`/v2/dashboard-bulk-updates`)
      .expect(200);

    const {
      body: { data: bulkUpdates },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(bulkUpdates.length).to.eq(1);

    const [bulkUpdate] = bulkUpdates;
    expect(bulkUpdate.id).to.equal(`${dashboardBulkUpdate.id}`);
    expect(bulkUpdate.type).to.equal('dashboard-bulk-update');
    expect(bulkUpdate.attributes.name).to.equal(dashboardBulkUpdate.name);
    expect(bulkUpdate.attributes.actionName).to.equal(dashboardAction.name);
    expect(bulkUpdate.attributes.inputFileUrl).to.equal(dashboardBulkUpdate.inputFileUrl);
    expect(bulkUpdate.attributes.inputFileRowCount).to.equal(dashboardBulkUpdate.inputFileRowCount);
    expect(bulkUpdate.attributes.dashboardActionLogId).to.equal(dashboardActionLog.id);
    expect(bulkUpdate.attributes.outputFileUrl).to.equal(dashboardBulkUpdate.outputFileUrl);
    expect(bulkUpdate.attributes.status).to.equal(dashboardBulkUpdate.status);
    expect(bulkUpdate.attributes.createdBy).to.equal(internalUser.email);

    expect(bulkUpdate.attributes.created).not.to.be.null;
    expect(bulkUpdate.attributes.created).to.be.a('string');
    expect(bulkUpdate.attributes.updated).not.to.be.null;
    expect(bulkUpdate.attributes.updated).to.be.a('string');
  });

  it('order dashboard bulk updates by created', async () => {
    const [firstActionLog, secondActionLog] = await Promise.all([
      factory.create<DashboardActionLog>('dashboard-action-log'),
      factory.create<DashboardActionLog>('dashboard-action-log'),
    ]);

    await Promise.all([
      factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
        dashboardActionLogId: firstActionLog.id,
        name: 'first',
        created: moment(),
      }),
      factory.create<DashboardBulkUpdate>('dashboard-bulk-update', {
        dashboardActionLogId: secondActionLog.id,
        name: 'second',
        created: moment().add(1, 'minute'),
      }),
    ]);

    const req = request(app)
      .get(`/v2/dashboard-bulk-updates`)
      .expect(200);

    const {
      body: { data: bulkUpdates },
    } = await withInternalUser(req, { roleAttrs: { name: 'bulkUpdateAdmin' } });

    expect(bulkUpdates[0].attributes.name).to.equal('second');
    expect(bulkUpdates[1].attributes.name).to.equal('first');
  });
});
