import { expect } from 'chai';
import * as request from 'supertest';
import { DashboardAction, DashboardActionReason } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';

import { clean, withInternalUser } from '../../../../test-helpers';

describe('GET /v2/dashboard-action-reasons', () => {
  before(() => clean());

  afterEach(() => clean());

  it('returns all active dashboard action reasons', async () => {
    const dashboardAction = await factory.create<DashboardAction>('dashboard-action');

    await Promise.all([
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        isActive: true,
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        isActive: true,
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        isActive: true,
      }),
    ]);

    const req = request(app)
      .get(`/v2/dashboard-action-reasons`)
      .expect(200);

    const {
      body: { data: reasons },
    } = await withInternalUser(req);

    expect(reasons.length).to.eq(3);
  });

  it('returns serialized data', async () => {
    const dashboardAction = await factory.create<DashboardAction>('dashboard-action');
    const dashboardActionReason = await factory.create<DashboardActionReason>(
      'dashboard-action-reason',
      {
        dashboardActionId: dashboardAction.id,
        isActive: true,
        noteRequired: false,
      },
    );

    const req = request(app)
      .get(`/v2/dashboard-action-reasons`)
      .expect(200);

    const {
      body: { data: reasons },
    } = await withInternalUser(req);

    expect(reasons.length).to.eq(1);

    const [reason] = reasons;
    expect(reason.id).to.equal(`${dashboardActionReason.id}`);
    expect(reason.type).to.equal('dashboard-action-reason');
    expect(reason.attributes.actionId).to.equal(`${dashboardAction.id}`);
    expect(reason.attributes.actionCode).to.equal(dashboardAction.code);
    expect(reason.attributes.reason).to.equal(dashboardActionReason.reason);
    expect(reason.attributes.isActive).to.be.true;
    expect(reason.attributes.noteRequired).to.be.false;

    // the factory's `created` and `updated` datetimes' milliseconds don't match those of the
    // responses, so we'll just verify that the fields are present and call it a day
    expect(reason.attributes.created).not.to.be.null;
    expect(reason.attributes.created).to.be.a('string');
    expect(reason.attributes.updated).not.to.be.null;
    expect(reason.attributes.updated).to.be.a('string');
  });

  it('does not include inactive reasons', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const [activeReason] = await Promise.all([
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        isActive: true,
        reason: 'Active!',
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: dashboardAction.id,
        isActive: false,
        reason: 'Too sleepy',
      }),
    ]);

    const req = request(app)
      .get(`/v2/dashboard-action-reasons`)
      .expect(200);

    const {
      body: { data: reasons },
    } = await withInternalUser(req);

    expect(reasons.length).to.eq(1);

    expect(reasons[0].id).to.equal(`${activeReason.id}`);
  });

  it('orders dashboard action reasons by action code, then note required t -> f, then reason', async () => {
    const [actionA, actionZ] = await Promise.all([
      factory.create<DashboardAction>('dashboard-action', {
        code: 'a-a-a',
      }),
      factory.create<DashboardAction>('dashboard-action', {
        code: 'z-z-z',
      }),
    ]);

    await Promise.all([
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: actionZ.id,
        reason: 'Best reason',
        noteRequired: false,
        isActive: true,
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        dashboardActionId: actionA.id,
        reason: 'Mediocre reason',
        noteRequired: false,
        isActive: true,
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: actionA.id,
        reason: 'AAaaaah',
        noteRequired: true,
        isActive: true,
      }),
      factory.create('dashboard-action-reason', {
        dashboardActionId: actionA.id,
        reason: 'Awesome reason',
        noteRequired: false,
        isActive: true,
      }),
    ]);

    const req = request(app)
      .get(`/v2/dashboard-action-reasons`)
      .expect(200);

    const {
      body: { data: reasons },
    } = await withInternalUser(req);

    expect(reasons[0].attributes).to.deep.include({
      actionCode: 'a-a-a',
      reason: 'Awesome reason',
      noteRequired: false,
    });

    expect(reasons[1].attributes).to.deep.include({
      actionCode: 'a-a-a',
      reason: 'Mediocre reason',
      noteRequired: false,
    });

    expect(reasons[2].attributes).to.deep.include({
      actionCode: 'a-a-a',
      reason: 'AAaaaah',
      noteRequired: true,
    });

    expect(reasons[3].attributes).to.deep.include({
      actionCode: 'z-z-z',
      reason: 'Best reason',
      noteRequired: false,
    });
  });
});
