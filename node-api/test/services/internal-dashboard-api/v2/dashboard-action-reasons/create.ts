import { expect } from 'chai';
import * as request from 'supertest';
import { DashboardActionReason } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { dashboardActionSerializers } from '../../serializers';

describe('POST /v2/dashboard-action-reasons', () => {
  before(() => clean());

  afterEach(() => clean());

  it('successfully creates an active dashboard action reason', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const reason = 'Because I can';

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({ dashboardActionReasons: [{ dashboardActionId: dashboardAction.id, reason }] })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const dashboardActionReason = await DashboardActionReason.findOne({
      where: { dashboardActionId: dashboardAction.id, reason },
    });

    expect(dashboardActionReason.dashboardActionId).to.equal(dashboardAction.id);
    expect(dashboardActionReason.reason).to.equal(reason);

    expect(data).to.have.length(1);
    expect(data[0].attributes.actionId).to.equal(`${dashboardAction.id}`);
    expect(data[0].attributes.actionCode).to.equal(dashboardAction.code);
    expect(data[0].attributes.reason).to.equal(reason);
    expect(data[0].attributes.isActive).to.be.true;
    expect(data[0].attributes.noteRequired).to.be.false;
  });

  it('can create an inactive dashboard action reason if specified', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const reason = 'Because I can';

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({
        dashboardActionReasons: [
          { dashboardActionId: dashboardAction.id, reason, isActive: false },
        ],
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const dashboardActionReason = await DashboardActionReason.findOne({
      where: { dashboardActionId: dashboardAction.id, reason },
    });

    expect(dashboardActionReason.dashboardActionId).to.equal(dashboardAction.id);
    expect(dashboardActionReason.reason).to.equal(reason);

    expect(data).to.have.length(1);
    expect(data[0].attributes.actionId).to.equal(`${dashboardAction.id}`);
    expect(data[0].attributes.actionCode).to.equal(dashboardAction.code);
    expect(data[0].attributes.reason).to.equal(reason);
    expect(data[0].attributes.isActive).to.be.false;
  });

  it('can create a reason with noteRequired true', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const reason = 'Always leave a note';

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({
        dashboardActionReasons: [
          { dashboardActionId: dashboardAction.id, reason, noteRequired: true },
        ],
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(data).to.have.length(1);
    expect(data[0].attributes.noteRequired).to.be.true;
  });

  it('successfully creates multiple dashboard reasons for the given dashboard action id', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const reasons = ['Because I can', 'Because I wanted to'];

    const dashboardActionReasons = reasons.map(reason => ({
      dashboardActionId: dashboardAction.id,
      reason,
    }));

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({ dashboardActionReasons })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const createdReasons = await DashboardActionReason.findAll({
      where: { reason: ['Because I can', 'Because I wanted to'] },
    });

    expect(createdReasons).to.have.length(2);

    const [becauseICanReason] = createdReasons.filter(cr => cr.reason === 'Because I can');
    const [becauseIWantedToReason] = createdReasons.filter(
      cr => cr.reason === 'Because I wanted to',
    );

    expect(data).to.have.length(2);
    expect(
      data.some(
        (reason: dashboardActionSerializers.IDashboardActionReasonResource) =>
          reason.attributes.reason === 'Because I can' &&
          reason.id === becauseICanReason.id.toString(),
      ),
    ).to.be.true;
    expect(
      data.some(
        (reason: dashboardActionSerializers.IDashboardActionReasonResource) =>
          reason.attributes.reason === 'Because I wanted to' &&
          reason.id === becauseIWantedToReason.id.toString(),
      ),
    ).to.be.true;
  });

  it('errors with no `dashboardActionReasons` parameter', async () => {
    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({})
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Required parameters not provided: dashboardActionReasons');
  });

  it('errors with empty `dashboardActionReasons` array', async () => {
    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({ dashboardActionReasons: [] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Please include at least one dashboard action reason');
  });

  it('errors if any `dashboardActionReason` is missing a `dashboardActionId`', async () => {
    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({ dashboardActionReasons: [{ reason: 'What action?' }] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Fields "dashboardActionId" and "reason" are required');
  });

  it('errors if any `dashboardActionReason` is missing a `reason`', async () => {
    const dashboardAction = await factory.create('dashboard-action');

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({ dashboardActionReasons: [{ dashboardActionId: dashboardAction.id }] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Fields "dashboardActionId" and "reason" are required');
  });

  it('silently ignores any action reason with a non-existent action id', async () => {
    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({
        dashboardActionReasons: [{ dashboardActionId: 1, reason: "Just 'cause" }],
      })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(data).to.be.empty;
  });

  it('is perfectly happy with a payload containing one or more existing action reasons', async () => {
    const reasons = ['Because I can', 'Because I wanted to', "Just 'cause"];

    const dashboardAction = await factory.create('dashboard-action');
    const dashboardActionId = dashboardAction.id;

    await factory.create('dashboard-action-reason', {
      dashboardActionId,
      reason: reasons[0],
    });
    await factory.create('dashboard-action-reason', {
      dashboardActionId,
      reason: reasons[1],
    });

    const dashboardActionReasons = reasons.map(reason => ({
      dashboardActionId,
      reason,
    }));

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({
        dashboardActionReasons,
      })
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });
  });

  it('is perfectly happy with a payload containing one or more duplicate action reasons', async () => {
    const dashboardAction = await factory.create('dashboard-action');
    const dashboardActionId = dashboardAction.id;
    const reasons = [
      'Because I can',
      'Because I can',
      'Because we can can can',
      'Because I wanted to',
      'Because I wanted to',
      "Just 'cause",
    ];

    const dashboardActionReasons = reasons.map(reason => ({
      dashboardActionId,
      reason,
    }));

    const req = request(app)
      .post('/v2/dashboard-action-reasons')
      .send({
        dashboardActionReasons,
      })
      .expect(200);

    await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });
  });
});
