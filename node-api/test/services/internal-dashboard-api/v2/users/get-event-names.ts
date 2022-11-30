import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';

describe('GET /v2/users/:id/event-names', () => {
  before(() => clean());

  afterEach(() => clean());

  it('responds with all event names for a user', async () => {
    const { id: userId } = await factory.create('user');

    const eventNames = await Promise.all([
      factory.create('audit-log', { userId, type: '1' }),
      factory.create('audit-log', { userId, type: '2' }),
      factory.create('audit-log', { userId, type: '3' }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/event-names`));

    expect(data).to.have.length(eventNames.length);
  });

  it('only responds with events associated to the user', async () => {
    const [user1, user2] = await Promise.all([factory.create('user'), factory.create('user')]);

    const [user1Log] = await Promise.all([
      factory.create('audit-log', { userId: user1.id, type: 'user1' }),
      factory.create('audit-log', { userId: user2.id, type: 'user2' }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${user1.id}/event-names`));

    expect(data).to.have.length(1);
    expect(data[0].id).to.equal(user1Log.type);
  });

  it('only responds with unique event names', async () => {
    const { id: userId } = await factory.create('user');

    await Promise.all([
      factory.create('audit-log', { userId, type: 'USER_CREATED' }),
      factory.create('audit-log', { userId, type: 'USER_CREATED' }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/event-names`));

    expect(data).to.have.length(1);
    expect(data[0].id).to.equal('USER_CREATED');
  });

  it('orders event names by type', async () => {
    const { id: userId } = await factory.create('user');

    const [systemGeneratedLog, aiGeneratedLog, userGeneratedLog] = await Promise.all([
      factory.create('audit-log', { userId, type: 'SYSTEM_GENERATED' }),
      factory.create('audit-log', { userId, type: 'AI_GENERATED' }),
      factory.create('audit-log', { userId, type: 'USER_CREATED' }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/event-names`));

    expect(data).to.have.length(3);
    expect(data[0].id).to.equal(aiGeneratedLog.type);
    expect(data[1].id).to.equal(systemGeneratedLog.type);
    expect(data[2].id).to.equal(userGeneratedLog.type);
  });

  it('responds with an empty array if there are no event names for the user', async () => {
    const { id: userId } = await factory.create('user');

    const {
      body: { data },
    } = await withInternalUser(request(app).get(`/v2/users/${userId}/event-names`));

    expect(data.length).to.equal(0);
  });
});
