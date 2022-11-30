import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { expect } from 'chai';
import { DashboardAction } from '../../../../../src/models';

describe('PATCH /v2/dashboard-actions/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  it('successfully patches name', async () => {
    const action = await factory.create('dashboard-action');

    const newName = 'replacement name';

    const req = request(app)
      .patch(`/v2/dashboard-actions/${action.id}`)
      .send({ name: newName })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const updatedAction = await DashboardAction.findByPk(action.id);

    expect(updatedAction.name).to.equal(newName);
    expect(data.attributes.name).to.equal(newName);
  });

  it('throws when required parameter name is not provided', async () => {
    const action = await factory.create('dashboard-action');

    const req = request(app)
      .patch(`/v2/dashboard-actions/${action.id}`)
      .send({})
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.contain('Required parameters not provided: name');
  });
});
