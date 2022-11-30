import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import { kebabCase, map, uniq, xor } from 'lodash';
import * as request from 'supertest';
import { DashboardAction } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { dashboardActionSerializers } from '../../serializers';

const validateAllActionsCreated = async (
  data: dashboardActionSerializers.IDashboardActionResource[],
  names: string[],
) => {
  const dashboardActions = await DashboardAction.findAll({
    where: { name: names },
  });

  expect(dashboardActions).to.have.length(names.length);

  const dashboardActionNames = map(dashboardActions, 'name');
  expect(xor(dashboardActionNames, names)).to.be.empty;

  expect(data).to.have.length(names.length);

  const resNames = map(data, 'attributes.name');
  expect(xor(resNames, names)).to.be.empty;
};

describe('POST /v2/dashboard-actions', () => {
  before(() => clean());

  afterEach(() => clean());

  it('successfully creates a dashboard action', async () => {
    const name = 'action!';

    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: [{ name, code: kebabCase(name) }] })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    const dashboardAction = await DashboardAction.findOne({
      where: { name },
    });

    expect(dashboardAction.name).to.equal(name);

    expect(data).to.have.length(1);
    expect(data[0].attributes.name).to.equal(name);
    expect(data[0].attributes.code).to.equal(kebabCase(name));
  });

  it('successfully creates multiple dashboard actions', async () => {
    const names = ['action!', 'inaction'];

    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: names.map(name => ({ name, code: kebabCase(name) })) })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    await validateAllActionsCreated(data, names);
  });

  it('errors if any `dashboardAction` is missing a `name`', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: [{ code: 'test' }] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Fields "name" and "code" are both required');
  });

  it('errors if any `dashboardAction` is missing a `code`', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: [{ name: 'test' }] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Fields "name" and "code" are both required');
  });

  it('errors if any `dashboardAction` has an incorrectly-formatted `code`', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: [{ name: 'test', code: 'what is going on here' }] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include(
      '"code" field can only contain numbers, letters, and dashes, as in: example-123-code',
    );
  });

  it('errors with an empty `dashboardActions` array', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: [] })
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Please include at least one dashboard action');
  });

  it('errors with a payload with no `dashboardActions` parameter', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({})
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Required parameters not provided: dashboardActions');
  });

  it('errors with an empty payload', async () => {
    const req = request(app)
      .post('/v2/dashboard-actions')
      .send()
      .expect(400);

    const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    expect(res.body.message).to.include('Required parameters not provided: dashboardActions');
  });

  it('is perfectly happy with a payload containing one or more existing dashboard actions', async () => {
    const names = ['action!', 'inaction', 'equal and opposite reaction'];
    await Bluebird.map(names.slice(2), name =>
      factory.create('dashboard-action', { name, code: kebabCase(name) }),
    );

    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: names.map(name => ({ name, code: kebabCase(name) })) })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    await validateAllActionsCreated(data, names);
  });

  it('is perfectly happy with a payload containing one or more duplicate dashboard actions', async () => {
    const names = ['action!', 'action!', 'inaction', 'inaction', 'equal and opposite reaction'];

    const req = request(app)
      .post('/v2/dashboard-actions')
      .send({ dashboardActions: names.map(name => ({ name, code: kebabCase(name) })) })
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

    await validateAllActionsCreated(data, uniq(names));
  });
});
