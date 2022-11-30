import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { expect } from 'chai';
import { DashboardActionReason } from '../../../../../src/models';

describe('PATCH /v2/dashboard-action-reasons/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  it('successfully patches isActive', async () => {
    const reason = await factory.create('dashboard-action-reason');

    const req = request(app)
      .patch(`/v2/dashboard-action-reasons/${reason.id}`)
      .send({ isActive: false })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const updatedReason = await DashboardActionReason.findByPk(reason.id);

    expect(updatedReason.isActive).to.be.false;
    expect(data.attributes.isActive).to.be.false;
  });

  it('successfully patches reason', async () => {
    const newReason = 'A new reason name';
    const reason = await factory.create('dashboard-action-reason', { reason: 'My old reason' });

    const req = request(app)
      .patch(`/v2/dashboard-action-reasons/${reason.id}`)
      .send({ reason: newReason })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const updatedReason = await DashboardActionReason.findByPk(reason.id);

    expect(updatedReason.reason).to.equal(newReason);
    expect(data.attributes.reason).to.equal(newReason);
  });

  it('successfully patches note_required', async () => {
    const reason = await factory.create('dashboard-action-reason', {
      reason: 'any',
      noteRequired: false,
    });

    const req = request(app)
      .patch(`/v2/dashboard-action-reasons/${reason.id}`)
      .send({ noteRequired: true })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const updatedReason = await DashboardActionReason.findByPk(reason.id);

    expect(updatedReason.noteRequired).to.be.true;
    expect(data.attributes.noteRequired).to.be.true;
  });
});
