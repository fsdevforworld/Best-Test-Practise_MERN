import * as request from 'supertest';
import { clean, replayHttp, withInternalUser } from '../../../../test-helpers';
import { User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { expect } from 'chai';

const fixturePath = 'services/internal-dashboard-api/v2/users/get-goals-account';

describe('GET /v2/users/:id/goals-account', () => {
  before(() => clean());

  afterEach(() => clean());

  it(
    'fetches goal account for user',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals-account`)
          .expect(200),
      );

      expect(typeof data.id).to.equal('string');
      expect(data.type).to.equal('goals-account');
      expect(data.attributes.status).to.equal('active');
    }),
  );

  it(
    'fetches all goal data for the user',
    replayHttp(`${fixturePath}/success.json`, async () => {
      const user = await factory.create<User>('user', { id: 3680 });

      const {
        body: { included },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals-account`)
          .expect(200),
      );

      expect(included.length).to.deep.equal(5);
      expect(included[0].type).to.equal('goal');
      expect(typeof included[0].id).to.equal('string');
    }),
  );

  it(
    'returns null when a goal account is not found for user',
    replayHttp(`${fixturePath}/no-account.json`, async () => {
      const user = await factory.create<User>('user', { id: 3681 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals-account`)
          .expect(200),
      );

      expect(data).to.be.null;
    }),
  );

  it(
    'returns null when we get a 403 response',
    replayHttp(`${fixturePath}/403.json`, async () => {
      const user = await factory.create<User>('user', { id: 403 });

      const {
        body: { data },
      } = await withInternalUser(
        request(app)
          .get(`/v2/users/${user.id}/goals-account`)
          .expect(200),
      );

      expect(data).to.be.null;
    }),
  );
});
